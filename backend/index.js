const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const { executeIpatool } = require('./ipatool');
const {
  findOrCreateAccountByEmail,
  touchAccount,
  getAccountById,
  listAccounts,
  renameAccount,
  deleteAccount,
  recordDownload,
  downloadCountsByAccount,
} = require('./db');
const {
  DATA_DIR,
  ensureBaseDirs,
  accountHome,
  accountDownloadsDir,
  removeAccountFiles,
} = require('./accounts');

// An account has a downloadable bundle if /data/accounts/<id>/downloadme/
// exists as a non-empty directory. Drop files there on the VPS to enable.
function hasDownloadBundle(accountId) {
  const dir = path.join(accountHome(accountId), 'downloadme');
  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return false;
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

ensureBaseDirs();

const app = express();
app.set('trust proxy', 1);

const port = Number(process.env.BACKEND_PORT || process.env.PORT || 3001);
const publicHostname = process.env.PUBLIC_HOSTNAME;

// Cookie signing secret — persisted under /data so it survives restarts
// and is stable across backend container recreations.
const SECRET_PATH = path.join(DATA_DIR, 'cookie-secret');
let cookieSecret;
try {
  cookieSecret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} catch {
  cookieSecret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_PATH, cookieSecret, { mode: 0o600 });
}

const ACTIVE_ACCOUNT_COOKIE = 'ipatool_active_account';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  signed: true,
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
};

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    try {
      const hostname = new URL(origin).hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === 'ipatool-web' ||
        hostname === 'apps.pwndarw.in' ||
        hostname.endsWith('.pwndarw.in') ||
        hostname.endsWith('.local') ||
        hostname.match(/^192\.168\.\d{1,3}\.\d{1,3}$/) ||
        hostname.match(/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/)
      ) {
        return callback(null, true);
      }
    } catch {
      console.warn('[CORS] Invalid origin:', origin);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(cookieParser(cookieSecret));
app.use(express.json());

// Resolve the account the current request is operating as, from the signed cookie.
function activeAccount(req) {
  const id = req.signedCookies[ACTIVE_ACCOUNT_COOKIE];
  return getAccountById(id);
}

function requireActiveAccount(req, res, next) {
  const acct = activeAccount(req);
  if (!acct) return res.status(401).json({ error: 'No active account' });
  req.account = acct;
  touchAccount(acct.id);
  next();
}

app.get('/', (req, res) => {
  res.send('ipatool-web backend is running!');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------- Authentication ----------

app.post('/api/auth/login', async (req, res) => {
  const { email, password, code } = req.body;

  console.log(
    '[API] POST /api/auth/login - Email:',
    email ? email.substring(0, 3) + '***' : 'none',
    'Has password:', !!password,
    'Has 2FA code:', !!code
  );

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Create (or find) the account record *before* login so we have a stable
  // HOME dir to run ipatool under. If login fails, the account row stays —
  // that's fine; it's just an email. A retry reuses it.
  const account = findOrCreateAccountByEmail(email);

  try {
    const args = [
      'auth', 'login',
      '--email', email,
      '--password', password,
      '--keychain-passphrase', 'password',
    ];
    const options = { accountId: account.id };
    if (code) options.twoFactorCode = code;

    const result = await executeIpatool(args, options);

    if (result.stderr.includes('two-factor') || result.stderr.includes('2FA')) {
      return res.json({
        success: false,
        requiresTwoFactor: true,
        message: 'Two-factor authentication code required',
      });
    }

    touchAccount(account.id);
    res.cookie(ACTIVE_ACCOUNT_COOKIE, account.id, COOKIE_OPTS);

    console.log('[API] Authentication successful for account', account.id);
    res.json({
      success: true,
      message: 'Authentication successful',
      account: {
        id: account.id,
        email: account.email,
        hasDownloadBundle: hasDownloadBundle(account.id),
      },
    });
  } catch (error) {
    console.error('[API] Authentication error:', error.message);
    if (error.message === '2FA_REQUIRED') {
      return res.json({
        success: false,
        requiresTwoFactor: true,
        message: 'Two-factor authentication code required',
      });
    }
    res.status(401).json({
      error: 'Authentication failed',
      details: error.message,
    });
  }
});

app.get('/api/auth/status', async (req, res) => {
  const acct = activeAccount(req);
  if (!acct) {
    return res.json({ authenticated: false, message: 'No active account' });
  }

  try {
    await executeIpatool(
      ['auth', 'info', '--keychain-passphrase', 'password'],
      { accountId: acct.id }
    );
    res.json({
      authenticated: true,
      account: {
        id: acct.id,
        email: acct.email,
        hasDownloadBundle: hasDownloadBundle(acct.id),
      },
    });
  } catch (error) {
    console.log('[API] auth/status — keychain not valid for', acct.id, ':', error.message);
    res.json({ authenticated: false, message: 'Session not valid' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(ACTIVE_ACCOUNT_COOKIE, { ...COOKIE_OPTS, maxAge: undefined });
  res.json({ success: true });
});

// ---------- Accounts management ----------

function serializeAccount(acct, { activeId, downloadCounts } = {}) {
  return {
    id: acct.id,
    email: acct.email,
    nickname: acct.nickname,
    createdAt: acct.created_at,
    lastUsedAt: acct.last_used_at,
    active: activeId ? acct.id === activeId : false,
    downloadCount: downloadCounts ? downloadCounts[acct.id] || 0 : 0,
    hasDownloadBundle: hasDownloadBundle(acct.id),
  };
}

app.get('/api/accounts', (req, res) => {
  const activeId = req.signedCookies[ACTIVE_ACCOUNT_COOKIE];
  const counts = downloadCountsByAccount();
  const accounts = listAccounts().map((a) =>
    serializeAccount(a, { activeId, downloadCounts: counts })
  );
  res.json({ accounts });
});

app.post('/api/accounts/switch', async (req, res) => {
  const { id } = req.body;
  const acct = getAccountById(id);
  if (!acct) return res.status(404).json({ error: 'Account not found' });

  res.cookie(ACTIVE_ACCOUNT_COOKIE, acct.id, COOKIE_OPTS);
  touchAccount(acct.id);

  // Verify the keychain is still valid so the frontend can route the user
  // straight to re-auth if it expired, instead of surfacing a cryptic error
  // on the next search/download.
  let authenticated = false;
  try {
    await executeIpatool(
      ['auth', 'info', '--keychain-passphrase', 'password'],
      { accountId: acct.id }
    );
    authenticated = true;
  } catch (err) {
    console.log('[API] switched to', acct.id, '— keychain invalid:', err.message);
  }

  res.json({
    authenticated,
    account: {
      id: acct.id,
      email: acct.email,
      nickname: acct.nickname,
      hasDownloadBundle: hasDownloadBundle(acct.id),
    },
  });
});

app.patch('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  const acct = getAccountById(id);
  if (!acct) return res.status(404).json({ error: 'Account not found' });

  let { nickname } = req.body;
  if (typeof nickname !== 'string') nickname = null;
  else nickname = nickname.trim().slice(0, 80) || null;

  renameAccount(id, nickname);
  res.json({ success: true });
});

app.delete('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  const acct = getAccountById(id);
  if (!acct) return res.status(404).json({ error: 'Account not found' });

  const wasActive = req.signedCookies[ACTIVE_ACCOUNT_COOKIE] === id;

  deleteAccount(id); // cascades to downloads via FK
  removeAccountFiles(id);

  if (wasActive) {
    res.clearCookie(ACTIVE_ACCOUNT_COOKIE, { ...COOKIE_OPTS, maxAge: undefined });
  }

  console.log('[API] deleted account', id, acct.email, wasActive ? '(was active)' : '');
  res.json({ success: true, deletedActive: wasActive });
});

// ---------- Per-account "downloadme" bundle ----------
// Streams a zip of /data/accounts/<id>/downloadme/ for whichever account is
// active. Presence of the folder on the VPS is the feature flag — no email
// hardcoding, no per-deploy config.

app.get('/api/downloadme', requireActiveAccount, (req, res) => {
  const dir = path.join(accountHome(req.account.id), 'downloadme');
  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return res.status(404).json({ error: 'No bundle available' });
  } catch {
    return res.status(404).json({ error: 'No bundle available' });
  }

  const safeEmail = req.account.email.replace(/[^a-z0-9.-]/gi, '_');
  const zipName = `downloadme-${safeEmail}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('[API] downloadme archive error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to build zip' });
  });
  archive.pipe(res);
  archive.directory(dir, false);
  archive.finalize();
});

// ---------- Search ----------

app.post('/api/search', requireActiveAccount, async (req, res) => {
  const { query } = req.body;
  console.log('[API] POST /api/search - Query:', query, 'account:', req.account.id);

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const result = await executeIpatool(
      ['search', query, '--keychain-passphrase', 'password', '--limit', '50'],
      { accountId: req.account.id }
    );
    const apps = parseSearchResults(result.stdout);
    console.log('[API] Search found', apps.length, 'apps');
    res.json({ success: true, apps });
  } catch (error) {
    console.error('[API] Search error:', error.message);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// ---------- Download ----------

app.post('/api/download', requireActiveAccount, async (req, res) => {
  const { bundleId, directDownload } = req.body;
  console.log(
    '[API] POST /api/download - Bundle ID:', bundleId,
    'Direct:', !!directDownload,
    'Account:', req.account.id
  );

  if (!bundleId) {
    return res.status(400).json({ error: 'Bundle ID is required' });
  }

  const accountId = req.account.id;
  const timestamp = Date.now();
  const outputDir = path.join(accountDownloadsDir(accountId), String(timestamp));
  fs.mkdirSync(outputDir, { recursive: true });

  const args = [
    'download',
    '--bundle-identifier', bundleId,
    '--keychain-passphrase', 'password',
    '--output', outputDir,
  ];

  try {
    let result;
    try {
      result = await executeIpatool(args, { accountId });
    } catch (err) {
      // ipatool requires an App Store license before the first download of a
      // given app. Acquire the free license and retry once.
      if (err.message && err.message.includes('license is required')) {
        console.log('[API] License required — acquiring via ipatool purchase...');
        await executeIpatool(
          ['purchase', '--bundle-identifier', bundleId, '--keychain-passphrase', 'password'],
          { accountId }
        );
        result = await executeIpatool(args, { accountId });
      } else {
        throw err;
      }
    }

    const files = fs.readdirSync(outputDir);
    const ipaFile = files.find((f) => f.endsWith('.ipa'));
    if (!ipaFile) throw new Error('No .ipa file found after download');

    const ipaPath = path.join(outputDir, ipaFile);
    const stat = fs.statSync(ipaPath);
    console.log('[API] IPA file found:', ipaFile, 'size:', stat.size);

    recordDownload({
      accountId,
      bundleId,
      appName: null,
      version: null,
      filename: ipaFile,
      size: stat.size,
    });

    if (directDownload) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${ipaFile}"`);
      const stream = fs.createReadStream(ipaPath);
      stream.on('error', (error) => {
        console.error('[API] File stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream file' });
        }
      });
      stream.pipe(res);
      return;
    }

    // URLs embed the account ID so iOS's OTA flow (which doesn't send cookies)
    // can still resolve the right account's download dir.
    res.json({
      success: true,
      filename: ipaFile,
      bundleId,
      downloadUrl: `/api/accounts/${accountId}/download-file/${encodeURIComponent(ipaFile)}`,
      manifestUrl: `/api/accounts/${accountId}/manifest/${bundleId}`,
      message: 'IPA ready for installation',
    });
  } catch (error) {
    console.error('[API] Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
  }
});

// ---------- OTA manifest + file serving (account-scoped, no cookie required) ----------

function findIpaForAccount(accountId, bundleId) {
  const dir = accountDownloadsDir(accountId);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }

  // Prefer a file whose name contains the bundleId; fall back to any .ipa.
  let fallback = null;
  for (const entry of entries) {
    const subdir = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(subdir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(subdir).filter((f) => f.endsWith('.ipa'));
    for (const f of files) {
      if (f.includes(bundleId)) return { dir: subdir, file: f };
      if (!fallback) fallback = { dir: subdir, file: f };
    }
  }
  return fallback;
}

function findIpaFileForAccount(accountId, filename) {
  const dir = accountDownloadsDir(accountId);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const subdir = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(subdir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(subdir);
    if (files.includes(filename)) {
      return path.join(subdir, filename);
    }
  }
  return null;
}

function buildManifest({ bundleId, appName, ipaUrl }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${ipaUrl}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${bundleId}</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${appName}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;
}

function appNameFromBundleId(bundleId) {
  const parts = bundleId.split('.');
  const last = parts[parts.length - 1] || bundleId;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

app.get('/api/accounts/:accountId/manifest/:bundleId', (req, res) => {
  const { accountId, bundleId } = req.params;
  if (!getAccountById(accountId)) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const found = findIpaForAccount(accountId, bundleId);
  if (!found) {
    return res.status(404).json({ error: 'IPA file not found for this bundle ID' });
  }

  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = publicHostname || req.get('host');
  // iOS requires HTTPS for OTA manifests — force it.
  const baseUrl = `https://${host}`;
  const ipaUrl = `${baseUrl}/api/accounts/${accountId}/download-file/${encodeURIComponent(found.file)}`;

  console.log('[API] Manifest for', bundleId, '→', found.file, '(account', accountId, ')');

  res.setHeader('Content-Type', 'application/xml');
  res.send(buildManifest({ bundleId, appName: appNameFromBundleId(bundleId), ipaUrl }));
});

app.get('/api/accounts/:accountId/download-file/:filename', (req, res) => {
  const { accountId, filename } = req.params;
  if (!getAccountById(accountId)) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const filePath = findIpaFileForAccount(accountId, filename);
  if (!filePath) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stats = fs.statSync(filePath);
  console.log('[API] Serving IPA:', filename, '(', stats.size, 'bytes, account', accountId, ')');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  const stream = fs.createReadStream(filePath);
  stream.on('error', (error) => {
    console.error('[API] File stream error:', error);
    if (!res.headersSent) res.status(500).send('File streaming error');
  });
  stream.pipe(res);
});

// ---------- Search result parser ----------

function stripAnsiCodes(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function parseSearchResults(output) {
  output = stripAnsiCodes(output);
  const jsonMatch = output.match(/apps=(\[.*?\])\s+count=/);
  if (jsonMatch) {
    try {
      const appsData = JSON.parse(jsonMatch[1]);
      return appsData.map((app) => ({
        name: app.name || '',
        bundleId: app.bundleID || '',
        version: app.version || '',
        icon: '',
      }));
    } catch (error) {
      console.error('[Parse] Failed to parse JSON:', error);
    }
  }

  const apps = [];
  const lines = output.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const bundleIdMatch =
      line.match(/Bundle ID:\s*([^\s]+)/i) ||
      line.match(/([a-z0-9\.]+\.[a-z0-9\.]+)/i);
    const nameMatch = line.match(/Name:\s*(.+?)(?:\s+Version:|$)/i);
    const versionMatch = line.match(/Version:\s*([^\s]+)/i);

    if (bundleIdMatch || nameMatch) {
      const appInfo = {
        bundleId: bundleIdMatch ? bundleIdMatch[1] : '',
        name: nameMatch ? nameMatch[1].trim() : '',
        version: versionMatch ? versionMatch[1] : '',
        icon: '',
      };
      if (!appInfo.name && line.length > 0) appInfo.name = line.trim();
      if (appInfo.bundleId || appInfo.name) apps.push(appInfo);
    }
  }
  return apps;
}

// ---------- Start ----------

app.listen(port, '0.0.0.0', () => {
  console.log('========================================');
  console.log('HTTP Server running (behind proxy)');
  console.log('========================================');
  console.log(`Server: http://0.0.0.0:${port}`);
  if (publicHostname) console.log(`Public: https://${publicHostname}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log('========================================');
});
