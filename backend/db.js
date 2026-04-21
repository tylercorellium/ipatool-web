const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = path.join(DATA_DIR, 'ipatool-web.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nickname TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    bundle_id TEXT NOT NULL,
    app_name TEXT,
    version TEXT,
    filename TEXT NOT NULL,
    size INTEGER,
    downloaded_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_downloads_account ON downloads(account_id);
`);

const stmts = {
  findByEmail: db.prepare('SELECT * FROM accounts WHERE email = ?'),
  findById: db.prepare('SELECT * FROM accounts WHERE id = ?'),
  list: db.prepare('SELECT * FROM accounts ORDER BY last_used_at DESC'),
  insert: db.prepare(
    'INSERT INTO accounts (id, email, nickname, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)'
  ),
  touch: db.prepare('UPDATE accounts SET last_used_at = ? WHERE id = ?'),
  rename: db.prepare('UPDATE accounts SET nickname = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM accounts WHERE id = ?'),
  insertDownload: db.prepare(
    `INSERT INTO downloads (account_id, bundle_id, app_name, version, filename, size, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ),
  listDownloads: db.prepare(
    'SELECT * FROM downloads WHERE account_id = ? ORDER BY downloaded_at DESC'
  ),
  getDownload: db.prepare('SELECT * FROM downloads WHERE id = ?'),
  deleteDownload: db.prepare('DELETE FROM downloads WHERE id = ?'),
  downloadCounts: db.prepare(
    'SELECT account_id, COUNT(*) AS count FROM downloads GROUP BY account_id'
  ),
};

function findOrCreateAccountByEmail(email) {
  const existing = stmts.findByEmail.get(email);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const now = Date.now();
  stmts.insert.run(id, email, null, now, now);
  return stmts.findByEmail.get(email);
}

function touchAccount(id) {
  stmts.touch.run(Date.now(), id);
}

function getAccountById(id) {
  return id ? stmts.findById.get(id) : null;
}

function listAccounts() {
  return stmts.list.all();
}

function renameAccount(id, nickname) {
  stmts.rename.run(nickname || null, id);
}

function deleteAccount(id) {
  stmts.remove.run(id);
}

function recordDownload({ accountId, bundleId, appName, version, filename, size }) {
  stmts.insertDownload.run(
    accountId,
    bundleId,
    appName || null,
    version || null,
    filename,
    size || null,
    Date.now()
  );
}

function listDownloads(accountId) {
  return stmts.listDownloads.all(accountId);
}

function getDownloadById(id) {
  return stmts.getDownload.get(id);
}

function deleteDownload(id) {
  stmts.deleteDownload.run(id);
}

function downloadCountsByAccount() {
  const rows = stmts.downloadCounts.all();
  const map = Object.create(null);
  for (const r of rows) map[r.account_id] = r.count;
  return map;
}

module.exports = {
  db,
  findOrCreateAccountByEmail,
  touchAccount,
  getAccountById,
  listAccounts,
  renameAccount,
  deleteAccount,
  recordDownload,
  listDownloads,
  getDownloadById,
  deleteDownload,
  downloadCountsByAccount,
};
