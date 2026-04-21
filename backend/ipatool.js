const { spawn } = require('child_process');
const { accountHome } = require('./accounts');

function redactArg(arg) {
  if (typeof arg !== 'string') return arg;
  if (arg.includes('@') || arg.length > 20) return '***';
  return arg;
}

// Spawn ipatool with optional per-account isolation.
// options:
//   accountId        — if set, run with HOME=/data/accounts/<id> so ipatool uses
//                      that account's keychain and cookie jar
//   twoFactorCode    — piped to stdin when a 2FA prompt is detected
//   streamResponse   — resolve with the child process (for download streaming)
function executeIpatool(args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (options.accountId) {
      env.HOME = accountHome(options.accountId);
    }

    const label = options.accountId ? ` [acct ${options.accountId.slice(0, 8)}]` : '';
    console.log(
      `[ipatool]${label} Executing:`,
      'ipatool',
      args.map(redactArg).join(' ')
    );

    const proc = spawn('ipatool', args, { env });

    if (options.streamResponse) {
      return resolve(proc);
    }

    let stdout = '';
    let stderr = '';
    let twoFactorPrompted = false;

    const handle2FA = (output) => {
      const lc = output.toLowerCase();
      const isPrompt =
        lc.includes('2fa code') ||
        lc.includes('enter code') ||
        lc.includes('two-factor') ||
        lc.includes('enter 2fa');
      if (!isPrompt || twoFactorPrompted) return;
      twoFactorPrompted = true;

      if (options.twoFactorCode) {
        try {
          proc.stdin.write(options.twoFactorCode + '\n');
        } catch (err) {
          console.error('[ipatool] Error writing 2FA code to stdin:', err.message);
        }
      } else {
        proc.kill('SIGTERM');
        reject(new Error('2FA_REQUIRED'));
      }
    };

    proc.stdout.on('data', (data) => {
      const out = data.toString();
      stdout += out;
      console.log('[ipatool stdout]:', out.trim());
      handle2FA(out);
    });

    proc.stderr.on('data', (data) => {
      const out = data.toString();
      stderr += out;
      console.log('[ipatool stderr]:', out.trim());
      handle2FA(out);
    });

    proc.on('close', (code) => {
      console.log('[ipatool] Process exited with code:', code);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else if (twoFactorPrompted || /2FA|two-factor/i.test(stderr)) {
        reject(new Error('2FA_REQUIRED'));
      } else {
        reject(new Error(`ipatool exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      console.error('[ipatool] Failed to start process:', err);
      reject(new Error(`Failed to start ipatool: ${err.message}`));
    });
  });
}

module.exports = { executeIpatool };
