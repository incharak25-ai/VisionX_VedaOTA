const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const dbPath = path.join(__dirname, "..", "vedaota.db");
const db = new Database(dbPath);

function nowIso() {
  return new Date().toISOString();
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function setupSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      bharat_index INTEGER NOT NULL,
      status TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS faults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_code TEXT NOT NULL,
      code TEXT NOT NULL,
      severity TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      context_reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mitm_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      level TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blockchain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_index INTEGER NOT NULL,
      previous_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seedData() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM vehicles").get().c;
  if (count > 0) return;

  const vehicles = [
    ["VEDA-MH-4012", "Mumbai", "Maharashtra", 92, "healthy"],
    ["VEDA-DL-1188", "New Delhi", "Delhi", 88, "healthy"],
    ["VEDA-KA-7091", "Bengaluru", "Karnataka", 90, "healthy"],
    ["VEDA-TN-3340", "Chennai", "Tamil Nadu", 86, "healthy"],
    ["VEDA-UP-5521", "Lucknow", "Uttar Pradesh", 84, "healthy"]
  ];

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (code, city, state, bharat_index, status, last_seen)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertFault = db.prepare(`
    INSERT INTO faults (vehicle_code, code, severity, city, state, context_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMitm = db.prepare(`
    INSERT INTO mitm_logs (event, level, created_at)
    VALUES (?, ?, ?)
  `);
  const insertBlock = db.prepare(`
    INSERT INTO blockchain (block_index, previous_hash, hash, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const v of vehicles) {
    insertVehicle.run(v[0], v[1], v[2], v[3], v[4], nowIso());
  }

  insertFault.run(
    "VEDA-MH-4012",
    "P0171",
    "high",
    "Mumbai",
    "Maharashtra",
    "Fuel adulteration likelihood high in this region this week; injector behavior remains in nominal pattern.",
    nowIso()
  );

  insertMitm.run("Handshake established for OTA package session #A19", "info", nowIso());
  insertMitm.run("Certificate pinning check passed for gateway edge-west-2", "info", nowIso());
  insertMitm.run("Anomalous proxy signature blocked (suspected MiTM)", "warning", nowIso());

  const genesisPayload = JSON.stringify({
    type: "GENESIS",
    note: "VedaOTA compliance ledger started"
  });
  const genesisHash = crypto.createHash("sha256").update(genesisPayload).digest("hex");
  insertBlock.run(0, "0".repeat(64), genesisHash, genesisPayload, nowIso());
}

function getVehicles() {
  return db.prepare("SELECT * FROM vehicles ORDER BY code").all();
}

function getFaultFeed(limit = 10) {
  return db
    .prepare("SELECT * FROM faults ORDER BY id DESC LIMIT ?")
    .all(limit);
}

function addFault(event) {
  db.prepare(`
    INSERT INTO faults (vehicle_code, code, severity, city, state, context_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.vehicleCode,
    event.code,
    event.severity,
    event.city,
    event.state,
    event.contextReason,
    nowIso()
  );
}

function updateVehicleStatus(vehicleCode, bharatIndex, status) {
  db.prepare(`
    UPDATE vehicles
    SET bharat_index = ?, status = ?, last_seen = ?
    WHERE code = ?
  `).run(bharatIndex, status, nowIso(), vehicleCode);
}

function getVehicleByCode(code) {
  return db.prepare("SELECT * FROM vehicles WHERE code = ?").get(code);
}

function logMitm(event, level = "info") {
  db.prepare(`
    INSERT INTO mitm_logs (event, level, created_at)
    VALUES (?, ?, ?)
  `).run(event, level, nowIso());
}

function getMitmLogs(limit = 20) {
  return db.prepare("SELECT * FROM mitm_logs ORDER BY id DESC LIMIT ?").all(limit);
}

function getChain() {
  return db.prepare("SELECT * FROM blockchain ORDER BY block_index ASC").all();
}

function addBlock(payload) {
  const last = db
    .prepare("SELECT * FROM blockchain ORDER BY block_index DESC LIMIT 1")
    .get();
  const previousHash = last ? last.hash : "0".repeat(64);
  const blockIndex = last ? last.block_index + 1 : 0;
  const base = `${blockIndex}|${previousHash}|${payload}|${nowIso()}`;
  const hash = crypto.createHash("sha256").update(base).digest("hex");

  db.prepare(`
    INSERT INTO blockchain (block_index, previous_hash, hash, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(blockIndex, previousHash, hash, payload, nowIso());
}

function randomVehicle() {
  const list = getVehicles();
  return list[randomRange(0, list.length - 1)];
}

setupSchema();
seedData();

module.exports = {
  getVehicles,
  getFaultFeed,
  addFault,
  updateVehicleStatus,
  getVehicleByCode,
  logMitm,
  getMitmLogs,
  getChain,
  addBlock,
  randomVehicle
};
