const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const app = express();
const port = Number(process.env.BACKEND_PORT || process.env.PORT || 3001);
const redirectPort = Number(process.env.REDIRECT_PORT || 3000);

// CORS configuration - dynamically allow frontend origin
// Allow requests from localhost/127.0.0.1 on common ports, plus same-host requests
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) return callback(null, true);

    // Parse the origin to check if it's from localhost/127.0.0.1
    try {
      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;

      // Allow localhost, 127.0.0.1, and any IP address in local network
      // Also allow .local domains and ipatool-web FQDN
      if (hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === 'ipatool-web' ||
          hostname.endsWith('.local') ||
          hostname.match(/^192\.168\.\d{1,3}\.\d{1,3}$/) ||
          hostname.match(/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ||
          hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/)) {
        return callback(null, true);
      }
    } catch (e) {
      console.warn('[CORS] Invalid origin:', origin);
    }

    // Reject other origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Helper function to execute ipatool commands
function executeIpatool(args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log('[ipatool] Executing command:', 'ipatool', args.map(arg => arg.includes('@') || arg.length > 20 ? '***' : arg).join(' '));

    const ipatool = spawn('ipatool', args);
    let stdout = '';
    let stderr = '';

    if (options.streamResponse) {
      // For download operations, return the process for streaming
      resolve(ipatool);
      return;
    }

    ipatool.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('[ipatool stdout]:', output.trim());
    });

    ipatool.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log('[ipatool stderr]:', output.trim());
    });

    ipatool.on('close', (code) => {
      console.log('[ipatool] Process exited with code:', code);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`ipatool exited with code ${code}: ${stderr}`));
      }
    });

    ipatool.on('error', (error) => {
      console.error('[ipatool] Failed to start process:', error);
      reject(new Error(`Failed to start ipatool: ${error.message}`));
    });
  });
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('ipatool-web backend is running!');
});

// Authentication endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password, code } = req.body;

  console.log('[API] POST /api/auth/login - Email:', email ? email.substring(0, 3) + '***' : 'none', 'Has password:', !!password, 'Has 2FA code:', !!code);

  if (!email || !password) {
    console.log('[API] Missing credentials');
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Build ipatool auth command with file-based keychain for headless environments
    const args = ['auth', 'login', '--email', email, '--password', password, '--keychain-passphrase', 'password'];

    if (code) {
      args.push('--code', code);
    }

    console.log('[API] Attempting authentication...');
    const result = await executeIpatool(args);

    // Check if 2FA is required
    if (result.stderr.includes('two-factor') || result.stderr.includes('2FA')) {
      console.log('[API] 2FA required');
      return res.json({
        success: false,
        requiresTwoFactor: true,
        message: 'Two-factor authentication code required'
      });
    }

    console.log('[API] Authentication successful');
    // Note: Session state is managed by ipatool's keychain, not server-side sessions
    res.json({
      success: true,
      message: 'Authentication successful'
    });
  } catch (error) {
    console.error('[API] Authentication error:', error.message);
    res.status(401).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
});

// Search endpoint
app.post('/api/search', async (req, res) => {
  const { query } = req.body;

  console.log('[API] POST /api/search - Query:', query);

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    // Execute ipatool search - search uses stored credentials from auth
    const args = ['search', query, '--keychain-passphrase', 'password', '--limit', '50'];
    console.log('[API] Executing search...');
    const result = await executeIpatool(args);

    // Parse the output to extract app information
    // ipatool typically outputs in a structured format
    const apps = parseSearchResults(result.stdout);
    console.log('[API] Search found', apps.length, 'apps');

    res.json({ success: true, apps });
  } catch (error) {
    console.error('[API] Search error:', error.message);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

// Download endpoint - returns metadata for OTA or direct download
app.post('/api/download', async (req, res) => {
  const { bundleId, directDownload } = req.body;

  console.log('[API] POST /api/download - Bundle ID:', bundleId, 'Direct:', directDownload);

  if (!bundleId) {
    return res.status(400).json({ error: 'Bundle ID is required' });
  }

  try {
    // Create a temporary output path
    const timestamp = Date.now();
    const outputDir = `/tmp/ipatool_${timestamp}`;
    const fs = require('fs');
    const path = require('path');

    // Create the output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Execute ipatool download - it will create a .ipa file in the output directory
    const args = [
      'download',
      '--bundle-identifier', bundleId,
      '--keychain-passphrase', 'password',
      '--output', outputDir
    ];

    console.log('[API] Downloading IPA...');
    const result = await executeIpatool(args);
    console.log('[API] Download command completed');

    // Find the .ipa file in the output directory
    const files = fs.readdirSync(outputDir);
    const ipaFile = files.find(f => f.endsWith('.ipa'));

    if (!ipaFile) {
      throw new Error('No .ipa file found after download');
    }

    const ipaPath = path.join(outputDir, ipaFile);
    console.log('[API] IPA file found:', ipaFile);

    // If direct download is requested, stream the file
    if (directDownload) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${ipaFile}"`);

      const fileStream = fs.createReadStream(ipaPath);

      fileStream.on('error', (error) => {
        console.error('[API] File stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream file' });
        }
      });

      fileStream.on('end', () => {
        console.log('[API] File stream completed');
      });

      fileStream.pipe(res);
    } else {
      // Return metadata for OTA installation
      res.json({
        success: true,
        filename: ipaFile,
        bundleId: bundleId,
        downloadUrl: `/api/download-file/${ipaFile}`,
        manifestUrl: `/api/manifest/${bundleId}`,
        message: 'IPA ready for installation'
      });
    }

  } catch (error) {
    console.error('[API] Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Download failed',
        details: error.message
      });
    }
  }
});

// Helper function to strip ANSI color codes
function stripAnsiCodes(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// Helper function to parse search results
function parseSearchResults(output) {
  // Strip ANSI color codes first
  output = stripAnsiCodes(output);

  const apps = [];

  // Try to find JSON in the output
  // ipatool outputs logs like "5:42PM INF apps=[...] count=44"
  const jsonMatch = output.match(/apps=(\[.*?\])\s+count=/);

  if (jsonMatch) {
    try {
      const appsData = JSON.parse(jsonMatch[1]);
      console.log('[Parse] Found', appsData.length, 'apps in JSON format');

      // Convert ipatool format to our format
      return appsData.map(app => ({
        name: app.name || '',
        bundleId: app.bundleID || '',
        version: app.version || '',
        icon: '' // ipatool doesn't provide icons in search
      }));
    } catch (error) {
      console.error('[Parse] Failed to parse JSON:', error);
    }
  }

  // Fallback to line-by-line parsing if JSON parsing fails
  const lines = output.split('\n').filter(line => line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for lines that contain app information
    const bundleIdMatch = line.match(/Bundle ID:\s*([^\s]+)/i) ||
                         line.match(/([a-z0-9\.]+\.[a-z0-9\.]+)/i);
    const nameMatch = line.match(/Name:\s*(.+?)(?:\s+Version:|$)/i);
    const versionMatch = line.match(/Version:\s*([^\s]+)/i);

    if (bundleIdMatch || nameMatch) {
      let appInfo = {
        bundleId: bundleIdMatch ? bundleIdMatch[1] : '',
        name: nameMatch ? nameMatch[1].trim() : '',
        version: versionMatch ? versionMatch[1] : '',
        icon: ''
      };

      if (!appInfo.name && line.length > 0) {
        appInfo.name = line.trim();
      }

      if (appInfo.bundleId || appInfo.name) {
        apps.push(appInfo);
      }
    }
  }

  return apps;
}

// Check authentication status endpoint
app.get('/api/auth/status', async (req, res) => {
  console.log('[API] GET /api/auth/status - Checking if user is authenticated');

  try {
    // Try to get account info to see if user is authenticated
    const result = await executeIpatool(['auth', 'info', '--keychain-passphrase', 'password']);

    // If auth info succeeds, user is authenticated
    console.log('[API] User is authenticated');
    res.json({
      authenticated: true,
      message: 'User is authenticated'
    });
  } catch (error) {
    console.log('[API] User is not authenticated:', error.message);
    res.json({
      authenticated: false,
      message: 'User is not authenticated'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to view manifest as plain text
app.get('/api/manifest/:bundleId/debug', (req, res) => {
  const { bundleId } = req.params;
  const fs = require('fs');
  const path = require('path');

  console.log('[DEBUG] Viewing manifest for bundle:', bundleId);

  // Find the IPA file for this bundle ID in /tmp/ipatool_* directories
  const tmpDir = '/tmp';
  let ipaFile = null;
  let appName = bundleId;

  try {
    const entries = fs.readdirSync(tmpDir).filter(d => d.startsWith('ipatool_'));

    console.log('[DEBUG] Found ipatool directories:', entries);

    for (const entry of entries) {
      const dirPath = path.join(tmpDir, entry);

      try {
        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) continue;
      } catch (error) {
        continue;
      }

      const files = fs.readdirSync(dirPath);
      const foundIpa = files.find(f => f.endsWith('.ipa'));

      if (foundIpa) {
        console.log('[DEBUG] Found IPA file:', foundIpa);
        if (foundIpa.includes(bundleId) || !ipaFile) {
          ipaFile = foundIpa;

          // Extract app name from bundle ID (last part after final dot)
          const bundleParts = bundleId.split('.');
          const lastPart = bundleParts[bundleParts.length - 1];
          appName = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);

          if (foundIpa.includes(bundleId)) {
            break;
          }
        }
      }
    }
  } catch (error) {
    console.error('[DEBUG] Error finding IPA:', error.message);
  }

  if (!ipaFile) {
    return res.status(404).send(`No IPA file found for bundle ID: ${bundleId}\n\nChecked directories in /tmp starting with 'ipatool_'`);
  }

  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol === 'https' ? 'https' : 'https'}://${host}`;
  const ipaUrl = `${baseUrl}/api/download-file/${encodeURIComponent(ipaFile)}`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
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
</plist>

---DEBUG INFO---
Protocol detected: ${protocol}
Host: ${host}
Base URL: ${baseUrl}
IPA File: ${ipaFile}
IPA URL: ${ipaUrl}
Bundle ID: ${bundleId}
App Name: ${appName}`;

  res.setHeader('Content-Type', 'text/plain');
  res.send(manifest);
});

// Endpoint to generate manifest.plist for OTA installation
app.get('/api/manifest/:bundleId', (req, res) => {
  const { bundleId } = req.params;
  const fs = require('fs');
  const path = require('path');

  console.log('[API] Generating manifest for bundle:', bundleId);

  // Find the IPA file for this bundle ID in /tmp/ipatool_* directories
  const tmpDir = '/tmp';
  let ipaFile = null;
  let appName = bundleId; // fallback

  try {
    const entries = fs.readdirSync(tmpDir).filter(d => d.startsWith('ipatool_'));

    for (const entry of entries) {
      const dirPath = path.join(tmpDir, entry);

      try {
        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) continue;
      } catch (error) {
        continue;
      }

      const files = fs.readdirSync(dirPath);
      const foundIpa = files.find(f => f.endsWith('.ipa'));

      if (foundIpa) {
        // Check if this IPA is for the requested bundle ID by examining the filename
        // ipatool typically names files as BundleId_AppId_Version.ipa
        // Example: org.whispersystems.signal_874139669_7.80.ipa
        if (foundIpa.includes(bundleId) || !ipaFile) {
          ipaFile = foundIpa;

          // Extract app name from bundle ID (last part after final dot)
          // org.whispersystems.signal -> Signal
          const bundleParts = bundleId.split('.');
          const lastPart = bundleParts[bundleParts.length - 1];
          // Capitalize first letter
          appName = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);

          if (foundIpa.includes(bundleId)) {
            break; // Found exact match
          }
        }
      }
    }
  } catch (error) {
    console.error('[API] Error finding IPA:', error.message);
  }

  if (!ipaFile) {
    return res.status(404).json({ error: 'IPA file not found for this bundle ID' });
  }

  // Get the server URL from request headers
  // Force HTTPS for manifest URL as iOS requires it
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol === 'https' ? 'https' : 'https'}://${host}`;

  const ipaUrl = `${baseUrl}/api/download-file/${encodeURIComponent(ipaFile)}`;
  const manifestUrl = `${baseUrl}/api/manifest/${bundleId}`;
  const debugUrl = `${baseUrl}/api/manifest/${bundleId}/debug`;

  console.log('[API] Generating manifest for:', ipaFile);
  console.log('[API] Base URL:', baseUrl);
  console.log('[API] Manifest URL:', manifestUrl);
  console.log('[API] Debug URL:', debugUrl);
  console.log('[API] IPA URL:', ipaUrl);
  console.log('[API] Protocol detected:', protocol, 'Host:', host);

  // Generate manifest.plist
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
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

  console.log('[API] ========== MANIFEST RESPONSE ==========');
  console.log(manifest);
  console.log('[API] ============================================');

  res.setHeader('Content-Type', 'application/xml');
  res.send(manifest);
});

// Endpoint to serve downloaded IPA files for OTA installation
app.get('/api/download-file/:filename', (req, res) => {
  const { filename } = req.params;
  const fs = require('fs');
  const path = require('path');

  console.log('[API] Serving IPA file:', filename);

  // Look for the file in /tmp/ipatool_* directories
  const tmpDir = '/tmp';
  const entries = fs.readdirSync(tmpDir).filter(d => d.startsWith('ipatool_'));

  for (const entry of entries) {
    const dirPath = path.join(tmpDir, entry);

    // Check if it's actually a directory before trying to read it
    try {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        continue; // Skip files, only process directories
      }
    } catch (error) {
      console.warn('[API] Error checking path:', dirPath, error.message);
      continue;
    }

    const files = fs.readdirSync(dirPath);
    const ipaFile = files.find(f => f === filename);

    if (ipaFile) {
      const filePath = path.join(dirPath, ipaFile);
      console.log('[API] Found IPA at:', filePath);

      // Get file stats to set Content-Length header (required by iOS)
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      console.log('[API] IPA file size:', fileSize, 'bytes');

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const fileStream = fs.createReadStream(filePath);

      fileStream.on('error', (error) => {
        console.error('[API] File stream error:', error);
        if (!res.headersSent) {
          res.status(500).send('File streaming error');
        }
      });

      fileStream.on('end', () => {
        console.log('[API] IPA file streaming completed');
      });

      fileStream.pipe(res);
      return;
    }
  }

  res.status(404).json({ error: 'File not found' });
});

// Endpoint to serve SSL certificate for iOS device installation
app.get('/ssl/cert.pem', (req, res) => {
  const certPath = path.join(__dirname, '..', 'ssl', 'cert.pem');
  if (fs.existsSync(certPath)) {
    // Use application/x-x509-ca-cert for better iOS compatibility
    // This triggers the certificate installation prompt on iOS
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="ipatool-web.crt"');
    res.sendFile(certPath);
  } else {
    res.status(404).send('Certificate not found');
  }
});

// Check if SSL certificates exist
const sslDir = path.join(__dirname, '..', 'ssl');
const certPath = path.join(sslDir, 'cert.pem');
const keyPath = path.join(sslDir, 'key.pem');

const hasSSL = fs.existsSync(certPath) && fs.existsSync(keyPath);

if (hasSSL) {
  // Start HTTPS server
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };

  https.createServer(httpsOptions, app).listen(port, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`🔒 HTTPS Server running`);
    console.log(`========================================`);
    console.log(`Server: https://0.0.0.0:${port}`);
    console.log(`Local:  https://localhost:${port}`);
    console.log(`\n📱 OTA Installation: ENABLED`);
    console.log(`   iOS devices can install apps directly`);
    console.log(`\n⚠️  Self-signed certificate requires trust:`);
    console.log(`   Download cert: https://<your-ip>:${port}/ssl/cert.pem`);
    console.log(`   Install on iOS and enable in Certificate Trust Settings`);
    console.log(`========================================`);
  });

  // Also start HTTP server that redirects to HTTPS
  http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
  }).listen(redirectPort, '0.0.0.0', () => {
    console.log(`🔓 HTTP redirect server on port ${redirectPort} -> HTTPS`);
  });

} else {
  // Start HTTP server only
  app.listen(port, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`🔓 HTTP Server running (no SSL)`);
    console.log(`========================================`);
    console.log(`Server: http://0.0.0.0:${port}`);
    console.log(`Local:  http://localhost:${port}`);
    console.log(`\n⚠️  OTA Installation: DISABLED`);
    console.log(`   SSL certificate not found`);
    console.log(`   Run './setup-ssl.sh' to generate certificates`);
    console.log(`========================================`);
  });
}
