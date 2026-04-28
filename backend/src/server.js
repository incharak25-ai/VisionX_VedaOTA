const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const indiaFaultDensity = {
  Maharashtra: 16,
  Delhi: 9,
  Karnataka: 11,
  "Tamil Nadu": 12,
  "Uttar Pradesh": 15,
  Gujarat: 8,
  Rajasthan: 7,
  Telangana: 10
};

const firmwareOptions = [
  {
    id: "genuine",
    label: "VedaOTA-Signed Firmware v3.2.1",
    sha256: "5f2fd8d63ac4eebdf0f8c4ac66ac2f9af0f8c865f801f3fd22f8f2364f31d501",
    rsa4096: "valid",
    dilithium3: "valid",
    tampered: false
  },
  {
    id: "tampered",
    label: "Firmware v3.2.1 (Mirror Copy)",
    sha256: "8ab4f9e2df11e95cb7e57cc4c01e18b01a2c81775106d552e9b11789aa9b915a",
    rsa4096: "unknown",
    dilithium3: "invalid",
    tampered: true
  }
];

const certChain = [
  "CN=VedaOTA Root Authority, algo=RSA-4096",
  "CN=VedaOTA Intermediate Secure OTA, algo=RSA-4096",
  "CN=Fleet Signer East Region, algo=Dilithium3"
];

app.get("/api/fleet/overview", (_req, res) => {
  res.json({
    vehicles: db.getVehicles(),
    faultFeed: db.getFaultFeed(8),
    faultDensity: indiaFaultDensity
  });
});

app.post("/api/fleet/simulate-fault", (_req, res) => {
  const vehicle = db.randomVehicle();
  const newIndex = Math.max(42, vehicle.bharat_index - 10);
  db.updateVehicleStatus(vehicle.code, newIndex, "degraded");

  const fault = {
    vehicleCode: vehicle.code,
    code: "P0171",
    severity: "high",
    city: vehicle.city,
    state: vehicle.state,
    contextReason:
      vehicle.city === "Mumbai"
        ? "Local fuel sample variance indicates adulteration trend; injector telemetry stays within expected duty-cycle."
        : "Air-fuel imbalance observed with regional quality anomaly pattern; recommend fuel-line check before injector replacement."
  };
  db.addFault(fault);

  res.json({
    ok: true,
    vehicle: db.getVehicleByCode(vehicle.code),
    fault
  });
});

app.post("/api/fleet/simulate-cyber-attack", (_req, res) => {
  const vehicles = db.getVehicles().map((v) => ({
    code: v.code,
    defended: true,
    defendTimeMs: 4400
  }));
  db.logMitm("Distributed spoof attempt detected across OTA channels", "warning");
  db.logMitm("Fleet policy auto-isolated suspicious signatures in 4.4s", "info");
  res.json({
    ok: true,
    timelineMs: 4400,
    defendedVehicles: vehicles
  });
});

app.get("/api/security/firmwares", (_req, res) => {
  res.json(firmwareOptions);
});

app.post("/api/security/validate", (req, res) => {
  const { firmwareId } = req.body || {};
  const selected = firmwareOptions.find((f) => f.id === firmwareId) || firmwareOptions[0];

  const steps = [
    { name: "Ingest package manifest", status: "pass" },
    { name: "Compute SHA-256 checksum", status: selected.tampered ? "fail" : "pass" },
    { name: "Verify RSA-4096 signature", status: selected.tampered ? "skip" : "pass" },
    { name: "Verify Dilithium3 signature", status: selected.tampered ? "skip" : "pass" },
    { name: "Validate X.509 certificate chain", status: selected.tampered ? "skip" : "pass" },
    { name: "Authorize rollout policy", status: selected.tampered ? "skip" : "pass" }
  ];

  if (selected.tampered) {
    db.logMitm("Validation pipeline blocked tampered firmware package", "warning");
  } else {
    db.logMitm("Validation pipeline accepted signed genuine package", "info");
  }

  res.json({
    firmware: selected,
    steps,
    accepted: !selected.tampered,
    message: selected.tampered
      ? "Rejected: SHA-256 mismatch detected. Package quarantined."
      : "Validation complete: cryptographic trust chain verified."
  });
});

app.get("/api/security/certs", (_req, res) => {
  res.json({ chain: certChain });
});

app.get("/api/security/mitm-log", (_req, res) => {
  res.json(db.getMitmLogs(12));
});

app.get("/api/recovery/blockchain", (_req, res) => {
  res.json(db.getChain());
});

app.post("/api/recovery/rollback", (_req, res) => {
  const steps = [
    "Detect rollout anomaly",
    "Lock active campaign",
    "Snapshot ECU state",
    "Select previous trusted firmware",
    "Re-issue signed rollback package",
    "Deploy staggered rollback batch",
    "Verify ECU health checks",
    "Mark campaign recovered"
  ];
  const payload = JSON.stringify({
    type: "ROLLBACK_EXECUTED",
    steps,
    operator: "auto-policy",
    ts: new Date().toISOString()
  });
  db.addBlock(payload);
  res.json({ ok: true, steps });
});

app.post("/api/recovery/mine-block", (req, res) => {
  const note = req.body?.note || "Manual compliance event";
  const payload = JSON.stringify({
    type: "AUDIT_EVENT",
    note,
    ts: new Date().toISOString()
  });
  db.addBlock(payload);
  res.json({ ok: true });
});

app.get("/api/recovery/audit-report", (_req, res) => {
  res.json({
    authority: "ARAI",
    reportId: `ARAI-${Date.now().toString().slice(-8)}`,
    status: "Compliant",
    highlights: [
      "All OTA artifacts signed and traceable",
      "Rollback protocol meets AIS-156 timing requirements",
      "Security events retained with immutable audit chain"
    ]
  });
});

app.get("/api/recovery/roi", (req, res) => {
  const fleetSize = Number(req.query.fleetSize || 300);
  const serviceVisits = Number(req.query.visits || 2);
  const avgVisitCost = 2200;
  const remoteResolutionRate = 0.62;
  const annualSavings = Math.round(fleetSize * serviceVisits * avgVisitCost * remoteResolutionRate);
  res.json({
    fleetSize,
    serviceVisits,
    annualSavingsInr: annualSavings
  });
});

app.listen(port, () => {
  console.log(`VedaOTA backend running on http://localhost:${port}`);
});
