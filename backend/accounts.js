const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');
const DOWNLOADS_DIR = path.join(DATA_DIR, 'downloads');

function ensureBaseDirs() {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// HOME dir ipatool runs under — its keychain + cookie jar live inside.
function accountHome(accountId) {
  const dir = path.join(ACCOUNTS_DIR, accountId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function accountDownloadsDir(accountId) {
  const dir = path.join(DOWNLOADS_DIR, accountId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeAccountFiles(accountId) {
  fs.rmSync(path.join(ACCOUNTS_DIR, accountId), { recursive: true, force: true });
  fs.rmSync(path.join(DOWNLOADS_DIR, accountId), { recursive: true, force: true });
}

module.exports = {
  DATA_DIR,
  ACCOUNTS_DIR,
  DOWNLOADS_DIR,
  ensureBaseDirs,
  accountHome,
  accountDownloadsDir,
  removeAccountFiles,
};
