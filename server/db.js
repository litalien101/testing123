// db.js - SQLite setup and helpers for Guardian server (updated)
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.GUARDIAN_DB_PATH || path.join(__dirname, 'guardian.db');

// ensure directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

// Initialize schema: users, invites, verifications
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    premium INTEGER DEFAULT 0,
    trial_end INTEGER,
    verified INTEGER DEFAULT 0,
    stripe_customer_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invites (
    token TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    used INTEGER DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS verifications (
    token TEXT PRIMARY KEY,
    email TEXT,
    used INTEGER DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
});

function createInvite(token, email, name, expiresAt, cb) {
  const stmt = db.prepare('INSERT INTO invites (token,email,name,expires_at) VALUES (?,?,?,?)');
  stmt.run(token, email, name || null, expiresAt || null, function(err) {
    cb(err);
  });
  stmt.finalize();
}

function getInvite(token, cb) {
  db.get('SELECT * FROM invites WHERE token = ?', [token], (err, row) => cb(err, row));
}

function markInviteUsed(token, cb) {
  db.run('UPDATE invites SET used = 1 WHERE token = ?', [token], function(err) { cb(err); });
}

function createUser(id, email, name, trialEnd, cb) {
  const stmt = db.prepare('INSERT OR REPLACE INTO users (id,email,name,trial_end,premium,verified) VALUES (?,?,?,?,?,?)');
  stmt.run(id, email, name || null, trialEnd || null, 0, 0, function(err) { cb(err); });
  stmt.finalize();
}

function setPremiumByEmail(email, isPremium, cb) {
  db.run('UPDATE users SET premium = ? WHERE email = ?', [isPremium ? 1 : 0, email], function(err) { cb(err); });
}

function getUserByEmail(email, cb) {
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => cb(err, row));
}

function listUsers(cb) {
  db.all('SELECT id,email,name,premium,verified,stripe_customer_id,created_at FROM users', [], (err, rows) => cb(err, rows));
}

function setVerified(email, cb) {
  db.run('UPDATE users SET verified = 1 WHERE email = ?', [email], function(err) { cb(err); });
}

function createVerification(token, email, expiresAt, cb) {
  const stmt = db.prepare('INSERT INTO verifications (token,email,expires_at) VALUES (?,?,?)');
  stmt.run(token, email, expiresAt || null, function(err) { cb(err); });
  stmt.finalize();
}

function getVerification(token, cb) {
  db.get('SELECT * FROM verifications WHERE token = ?', [token], (err, row) => cb(err, row));
}

function markVerificationUsed(token, cb) {
  db.run('UPDATE verifications SET used = 1 WHERE token = ?', [token], function(err) { cb(err); });
}

function setStripeCustomerId(email, customerId, cb) {
  db.run('UPDATE users SET stripe_customer_id = ? WHERE email = ?', [customerId, email], function(err) { cb(err); });
}

module.exports = {
  db,
  createInvite,
  getInvite,
  markInviteUsed,
  createUser,
  setPremiumByEmail,
  getUserByEmail,
  listUsers,
  setVerified,
  createVerification,
  getVerification,
  markVerificationUsed,
  setStripeCustomerId
};