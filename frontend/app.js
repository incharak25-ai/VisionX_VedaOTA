const API = "http://localhost:8080/api";

const el = (id) => document.getElementById(id);

const vehiclesEl = el("vehicles");
const heatmapEl = el("heatmapChart");
const faultFeedEl = el("faultFeed");
const simulateFaultBtn = el("simulateFaultBtn");
const simulateAttackBtn = el("simulateAttackBtn");
const attackBanner = el("attackBanner");
const fleetKpis = el("fleetKpis");
const demoModeBtn = el("demoModeBtn");
const demoStatus = el("demoStatus");
const installAppBtn = el("installAppBtn");

const firmwareSelect = el("firmwareSelect");
const validateBtn = el("validateBtn");
const pipelineEl = el("pipeline");
const validationMessage = el("validationMessage");
const certChainEl = el("certChain");
const mitmLogEl = el("mitmLog");

const rollbackBtn = el("rollbackBtn");
const mineBlockBtn = el("mineBlockBtn");
const auditBtn = el("auditBtn");
const rollbackStepsEl = el("rollbackSteps");
const blockchainEl = el("blockchain");

const fleetSlider = el("fleetSlider");
const visitSlider = el("visitSlider");
const fleetSizeValue = el("fleetSizeValue");
const visitValue = el("visitValue");
const roiOut = el("roiOut");

const auditDialog = el("auditDialog");
const auditBody = el("auditBody");
const closeAuditBtn = el("closeAuditBtn");
let demoRunning = false;
let indiaMap = null;
let mapHeatLayer = null;
let markerLayer = null;
let deferredInstallPrompt = null;

const stateCenters = {
  Maharashtra: [19.7515, 75.7139],
  Delhi: [28.7041, 77.1025],
  Karnataka: [15.3173, 75.7139],
  "Tamil Nadu": [11.1271, 78.6569],
  "Uttar Pradesh": [26.8467, 80.9462],
  Gujarat: [22.2587, 71.1924],
  Rajasthan: [27.0238, 74.2179],
  Telangana: [18.1124, 79.0193]
};
const navButtons = document.querySelectorAll(".nav-btn");
const tabButtons = document.querySelectorAll(".tab-btn");
const screens = document.querySelectorAll(".app-screen");

function fmtTs(iso) {
  return new Date(iso).toLocaleTimeString();
}

function colorForDensity(v) {
  if (v >= 14) return "#fce8e7";
  if (v >= 10) return "#fef4e8";
  return "#eef8f3";
}

function setActiveScreen(targetId) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === targetId);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
}

function setupPwaInstall() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // Keep app functional even if SW registration fails.
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppBtn.classList.remove("hidden");
  });

  installAppBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installAppBtn.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    installAppBtn.classList.add("hidden");
    demoStatus.textContent = "App installed. Launch from your home screen or desktop app list.";
  });
}

function addSkeleton(container, count = 3) {
  container.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const node = document.createElement("div");
    node.className = "skeleton";
    container.append(node);
  }
}

function renderFleetKpis(vehicles, feed) {
  const total = vehicles.length;
  const avg = Math.round(vehicles.reduce((sum, v) => sum + v.bharat_index, 0) / total);
  const degraded = vehicles.filter((v) => v.status === "degraded").length;
  fleetKpis.innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Active Vehicles</div>
      <div class="kpi-value">${total}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Avg Bharat Index</div>
      <div class="kpi-value">${avg}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Open Faults (24h)</div>
      <div class="kpi-value">${feed.length + degraded}</div>
    </div>
  `;
}

function renderVehicles(vehicles) {
  vehiclesEl.innerHTML = vehicles
    .map(
      (v) => `<div class="card">
        <div class="vehicle-head">
          <span class="vehicle-code">${v.code}</span>
          <span class="vehicle-city">${v.city}, ${v.state}</span>
        </div>
        <div class="vehicle-index">
          <span>Bharat Index</span>
          <strong>${v.bharat_index}</strong>
        </div>
        <span class="status ${v.status}">${v.status}</span>
      </div>`
    )
    .join("");
}

function renderHeatmap(mapData) {
  const entries = Object.entries(mapData).filter(([state]) => stateCenters[state]);

  if (!window.L) {
    heatmapEl.innerHTML = entries
      .map(
        ([state, val]) =>
          `<div class="heatmap-item" style="background:${colorForDensity(val)}">
            <strong>${state}</strong>
            <span>${val} cases</span>
          </div>`
      )
      .join("");
    return;
  }

  if (!indiaMap) {
    indiaMap = L.map("heatmapChart", {
      zoomControl: false,
      attributionControl: false
    }).setView([22.5937, 78.9629], 4.5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 10,
      minZoom: 4
    }).addTo(indiaMap);
    markerLayer = L.layerGroup().addTo(indiaMap);
  }

  if (markerLayer) markerLayer.clearLayers();

  const heatPoints = entries.map(([state, density]) => {
    const [lat, lng] = stateCenters[state];
    const intensity = Math.min(1, density / 18);
    const circle = L.circleMarker([lat, lng], {
      radius: 5 + density / 5,
      color: "#b42318",
      fillColor: density >= 14 ? "#ef4444" : density >= 10 ? "#f59e0b" : "#22c55e",
      fillOpacity: 0.45,
      weight: 1
    });
    circle.bindPopup(
      `<div class="map-popup"><strong>${state}</strong><br/>Fault density: ${density}</div>`
    );
    circle.addTo(markerLayer);
    return [lat, lng, intensity];
  });

  if (mapHeatLayer) {
    indiaMap.removeLayer(mapHeatLayer);
  }

  mapHeatLayer = L.heatLayer(heatPoints, {
    radius: 28,
    blur: 22,
    maxZoom: 7,
    gradient: {
      0.2: "#22c55e",
      0.5: "#f59e0b",
      0.8: "#ef4444"
    }
  }).addTo(indiaMap);
}

function renderFaultFeed(feed) {
  faultFeedEl.innerHTML = feed
    .map(
      (f) =>
        `<li>[${fmtTs(f.created_at)}] ${f.vehicle_code} - DTC ${f.code} (${f.city}, ${f.state})<br>${f.context_reason}</li>`
    )
    .join("");
}

function renderMitmLogs(logs) {
  mitmLogEl.innerHTML = logs
    .map((l) => `<li>${fmtTs(l.created_at)} [${l.level}] ${l.event}</li>`)
    .join("");
}

function renderChain(chain) {
  blockchainEl.innerHTML = chain
    .slice(-8)
    .reverse()
    .map(
      (b) =>
        `<li>#${b.block_index} ${fmtTs(b.created_at)}<br/>hash=${b.hash.slice(0, 12)}... prev=${b.previous_hash.slice(0, 12)}...</li>`
    )
    .join("");
}

async function loadFleetOverview() {
  addSkeleton(fleetKpis, 3);
  addSkeleton(vehiclesEl, 5);
  const data = await fetch(`${API}/fleet/overview`).then((r) => r.json());
  renderFleetKpis(data.vehicles, data.faultFeed);
  renderVehicles(data.vehicles);
  renderHeatmap(data.faultDensity);
  renderFaultFeed(data.faultFeed);
}

async function loadSecurity() {
  const firmwares = await fetch(`${API}/security/firmwares`).then((r) => r.json());
  firmwareSelect.innerHTML = firmwares
    .map((f) => `<option value="${f.id}">${f.label}</option>`)
    .join("");

  const certs = await fetch(`${API}/security/certs`).then((r) => r.json());
  certChainEl.innerHTML = certs.chain.map((c) => `<li>${c}</li>`).join("");

  const logs = await fetch(`${API}/security/mitm-log`).then((r) => r.json());
  renderMitmLogs(logs);
}

async function loadRecovery() {
  addSkeleton(blockchainEl, 3);
  const chain = await fetch(`${API}/recovery/blockchain`).then((r) => r.json());
  renderChain(chain);
}

async function runValidation() {
  pipelineEl.innerHTML = "";
  validationMessage.className = "message";
  const resp = await fetch(`${API}/security/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firmwareId: firmwareSelect.value })
  }).then((r) => r.json());

  for (const step of resp.steps) {
    const li = document.createElement("li");
    li.className = step.status;
    li.textContent = `${step.name} - ${step.status.toUpperCase()}`;
    pipelineEl.append(li);
    await new Promise((resolve) => setTimeout(resolve, 260));
  }

  validationMessage.textContent = resp.accepted
    ? "Accepted: SHA-256, RSA-4096, Dilithium3 and X.509 trust chain verified for rollout."
    : "Rejected: SHA-256 mismatch at intake stage; package quarantined per policy.";
  validationMessage.classList.add(resp.accepted ? "good" : "bad");
  loadSecurity();
}

async function runRollback() {
  rollbackStepsEl.innerHTML = "";
  const resp = await fetch(`${API}/recovery/rollback`, { method: "POST" }).then((r) => r.json());
  for (const step of resp.steps) {
    const li = document.createElement("li");
    li.className = "pass";
    li.textContent = step;
    rollbackStepsEl.append(li);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  loadRecovery();
}

async function mineBlock() {
  await fetch(`${API}/recovery/mine-block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: "Manual mine from dashboard button" })
  });
  loadRecovery();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemoMode() {
  if (demoRunning) return;
  demoRunning = true;
  demoModeBtn.disabled = true;

  try {
    setActiveScreen("fleetScreen");
    demoStatus.textContent = "Step 1/6: Triggering India-context fault event (Mumbai DTC P0171)...";
    await fetch(`${API}/fleet/simulate-fault`, { method: "POST" });
    await loadFleetOverview();
    await wait(1200);

    demoStatus.textContent = "Step 2/6: Running tampered firmware validation path...";
    setActiveScreen("securityScreen");
    firmwareSelect.value = "tampered";
    await runValidation();
    await wait(1300);

    demoStatus.textContent = "Step 3/6: Simulating fleet cyber attack defense...";
    setActiveScreen("fleetScreen");
    await fetch(`${API}/fleet/simulate-cyber-attack`, { method: "POST" });
    attackBanner.classList.remove("hidden");
    attackBanner.textContent = "Fleet-wide spoof campaign detected. Policy defense active.";
    await loadSecurity();
    await wait(1000);
    attackBanner.textContent = "Defense complete: all active vehicles secured in 4.4s.";
    await wait(700);

    demoStatus.textContent = "Step 4/6: Executing rollback engine...";
    setActiveScreen("recoveryScreen");
    await runRollback();
    await wait(1000);

    demoStatus.textContent = "Step 5/6: Mining compliance block and refreshing audit trail...";
    await mineBlock();
    await wait(700);

    demoStatus.textContent = "Step 6/6: Calculating ROI impact...";
    setActiveScreen("recoveryScreen");
    fleetSlider.value = "1200";
    visitSlider.value = "3";
    await loadRoi();
    await wait(600);

    demoStatus.textContent = "Demo complete: resilient OTA workflow validated for ARAI/AIS review.";
  } finally {
    demoRunning = false;
    demoModeBtn.disabled = false;
  }
}

async function loadRoi() {
  const fleetSize = Number(fleetSlider.value);
  const visits = Number(visitSlider.value);
  fleetSizeValue.textContent = fleetSize;
  visitValue.textContent = visits;
  const data = await fetch(`${API}/recovery/roi?fleetSize=${fleetSize}&visits=${visits}`).then((r) =>
    r.json()
  );
  roiOut.textContent = `Estimated annual savings: ₹${data.annualSavingsInr.toLocaleString("en-IN")}`;
}

simulateFaultBtn.addEventListener("click", async () => {
  await fetch(`${API}/fleet/simulate-fault`, { method: "POST" });
  loadFleetOverview();
});

simulateAttackBtn.addEventListener("click", async () => {
  attackBanner.classList.remove("hidden");
  attackBanner.textContent = "Cyber attack simulation started... applying signed fleet defense policy";
  const data = await fetch(`${API}/fleet/simulate-cyber-attack`, { method: "POST" }).then((r) => r.json());
  setTimeout(() => {
    attackBanner.textContent = `Threat neutralized. ${data.defendedVehicles.length} vehicles defended in ${(
      data.timelineMs / 1000
    ).toFixed(1)}s`;
  }, 700);
  loadSecurity();
});

validateBtn.addEventListener("click", runValidation);
rollbackBtn.addEventListener("click", runRollback);
mineBlockBtn.addEventListener("click", mineBlock);
demoModeBtn.addEventListener("click", runDemoMode);
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveScreen(btn.dataset.target));
});
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveScreen(btn.dataset.target));
});

auditBtn.addEventListener("click", async () => {
  const report = await fetch(`${API}/recovery/audit-report`).then((r) => r.json());
  auditBody.textContent = JSON.stringify(
    {
      ...report,
      standards: ["ARAI", "AIS-156", "AIS-038 Rev.2"],
      generatedAt: new Date().toISOString()
    },
    null,
    2
  );
  auditDialog.showModal();
});

closeAuditBtn.addEventListener("click", () => auditDialog.close());
fleetSlider.addEventListener("input", loadRoi);
visitSlider.addEventListener("input", loadRoi);

async function init() {
  setupPwaInstall();
  await loadFleetOverview();
  await loadSecurity();
  await loadRecovery();
  await loadRoi();
}

init();
