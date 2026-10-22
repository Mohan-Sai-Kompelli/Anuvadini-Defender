/**
 * Anuvadini Detector Enterprise Dashboard Engine
 * Zero DOM thrashing keyed updates, 7-tab navigation, Chart.js analytics,
 * and bi-directional IT enforcement console.
 */

// Global Application State
const state = {
  clients: new Map(), // Key: client_id, Value: client telemetry
  filter: 'all',      // 'all' | 'alerts' | 'active' | 'idle' | 'offline'
  department: 'all',  // 'all' | 'Engineering' | 'Design' | ...
  searchQuery: '',
  audioAlertsEnabled: true,
  gridCols: 4,
  modalClientId: null,
  focusedClientId: null,
  activeTab: 'tab-fleet',
  stats: {
    bytesReceived: 0,
    framesReceived: 0,
    fps: 0,
    kbps: 0
  }
};

// Web Audio Warning Chime Synthesizer (Loud High-Volume Multi-Tone Security Alert)
let audioCtx = null;

function ensureAudioUnlocked() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.warn("Audio unlock error:", e);
  }
}

// Auto-unlock Web Audio on first user interaction anywhere on page
document.addEventListener('click', ensureAudioUnlocked, { once: true });
document.addEventListener('keydown', ensureAudioUnlocked, { once: true });

function playAlertChime(volume = 0.90) {
  if (!state.audioAlertsEnabled) return;
  try {
    ensureAudioUnlocked();
    if (!audioCtx) return;

    const t0 = audioCtx.currentTime;

    // Stage 1: Sharp high-volume penetrating chime (988Hz -> 784Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'triangle'; // Triangle delivers rich, loud, piercing harmonics
    osc1.frequency.setValueAtTime(987.77, t0); // B5
    osc1.frequency.setValueAtTime(783.99, t0 + 0.12); // G5
    gain1.gain.setValueAtTime(volume, t0);
    gain1.gain.exponentialRampToValueAtTime(0.01, t0 + 0.40);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(t0);
    osc1.stop(t0 + 0.42);

    // Stage 2: Second urgent high-pitch alert pulse at t0 + 0.18s (1175Hz -> 880Hz)
    const t1 = t0 + 0.18;
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, t1); // D6
    osc2.frequency.setValueAtTime(880.00, t1 + 0.14); // A5
    gain2.gain.setValueAtTime(volume * 0.95, t1);
    gain2.gain.exponentialRampToValueAtTime(0.01, t1 + 0.45);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(t1);
    osc2.stop(t1 + 0.48);

    // Stage 3: Low resonant confirmation punch for room presence
    const osc3 = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(440.00, t0);
    gain3.gain.setValueAtTime(volume * 0.5, t0);
    gain3.gain.exponentialRampToValueAtTime(0.005, t0 + 0.50);
    osc3.connect(gain3);
    gain3.connect(audioCtx.destination);
    osc3.start(t0);
    osc3.stop(t0 + 0.52);

  } catch (e) {
    console.warn("Audio chime:", e);
  }
}

// Chart.js Instances
let donutChart = null;
let hourlyBarChart = null;

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupFilters();
  setupGridButtons();
  setupModals();
  initWebSocket();
  startThroughputMonitor();
  pollShiftStatus();
  setInterval(pollShiftStatus, 10000);
});

// ============================================================================
// Tab Management
// ============================================================================
function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      switchTab(targetId);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById(tabId);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".tab-btn").forEach(btn => {
    if (btn.getAttribute("data-tab") === tabId) {
      btn.className = "tab-btn px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm transition flex items-center gap-2 whitespace-nowrap";
    } else {
      btn.className = "tab-btn px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition flex items-center gap-2 whitespace-nowrap";
    }
  });

  if (tabId === "tab-focus") {
    populateFocusSelect();
    refreshFocusStation();
  } else if (tabId === "tab-incidents") {
    loadIncidents();
  } else if (tabId === "tab-analytics") {
    loadAnalytics();
  } else if (tabId === "tab-rules") {
    loadRules();
  } else if (tabId === "tab-nim") {
    loadNimSettings();
  }
}

// ============================================================================
// Filters & Search
// ============================================================================
function setupFilters() {
  // Department filter pills
  document.querySelectorAll(".dept-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dept-btn").forEach(b => {
        b.className = "dept-btn px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition";
      });
      btn.className = "dept-btn px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white transition";
      state.department = btn.getAttribute("data-dept");
      applyFilters();
    });
  });

  // Status tabs
  document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach(t => {
        t.className = "filter-tab px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition";
      });
      tab.className = "filter-tab px-3 py-1.5 rounded-lg bg-slate-800 text-white font-medium transition";
      state.filter = tab.getAttribute("data-filter");
      applyFilters();
    });
  });

  // Search input
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }

  // Sound toggle
  const soundBtn = document.getElementById("btn-sound-toggle");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      state.audioAlertsEnabled = !state.audioAlertsEnabled;
      soundBtn.innerHTML = state.audioAlertsEnabled
        ? `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg><span>Loud Audio ON</span>`
        : `<svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg><span>Audio MUTED</span>`;
      if (state.audioAlertsEnabled) {
        playAlertChime();
      }
    });
  }

  // Shift override dropdown
  const shiftOverride = document.getElementById("shift-override-select");
  if (shiftOverride) {
    shiftOverride.addEventListener("change", async (e) => {
      await fetch("/api/shift/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: e.target.value })
      });
      pollShiftStatus();
    });
  }
}

function setupGridButtons() {
  document.querySelectorAll("[data-cols]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-cols]").forEach(b => {
        b.className = "px-2 py-1 rounded hover:bg-slate-800 text-slate-300";
      });
      btn.className = "px-2 py-1 rounded bg-slate-700 text-white font-bold";
      const cols = btn.getAttribute("data-cols");
      const grid = document.getElementById("client-grid");
      grid.className = `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-${cols} lg:grid-cols-${cols} gap-4`;
    });
  });
}

function applyFilters() {
  state.clients.forEach((data, clientId) => {
    const card = document.getElementById(`card-${clientId}`);
    if (!card) return;

    let matchDept = (state.department === "all") || (data.department && data.department.toLowerCase() === state.department.toLowerCase());
    let matchStatus = true;
    const isTrading = (data.state === "TRADING" || data.status?.includes("Trading"));
    const isEntertainment = (data.state === "ENTERTAINMENT" || data.status?.includes("Entertainment"));
    const isGaming = (data.state === "GAMING" || data.status === "Alert/Game" || data.status?.includes("Gaming") || data.state?.includes("GAMING"));
    const isViolation = isTrading || isEntertainment || isGaming;
    const isIdle = (data.status === "Idle" || data.state === "IDLE");
    const isOffline = (!data.connected || data.status === "Offline");

    if (state.filter === "alerts") matchStatus = isViolation;
    else if (state.filter === "active") matchStatus = (!isViolation && !isIdle && !isOffline);
    else if (state.filter === "idle") matchStatus = isIdle;
    else if (state.filter === "offline") matchStatus = isOffline;


    let matchSearch = true;
    if (state.searchQuery) {
      const q = state.searchQuery;
      const host = (data.hostname || clientId).toLowerCase();
      const user = (data.username || "").toLowerCase();
      const win = (data.window || "").toLowerCase();
      const dept = (data.department || "").toLowerCase();
      matchSearch = host.includes(q) || user.includes(q) || win.includes(q) || dept.includes(q);
    }

    if (matchDept && matchStatus && matchSearch) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  });
}

// ============================================================================
// Keyed DOM Updates for Workstation Cards (Zero DOM Thrashing)
// ============================================================================
function updateOrCreateCard(clientId, data) {
  let card = document.getElementById(`card-${clientId}`);
  const isTrading = (data.state === "TRADING" || data.status?.includes("Trading"));
  const isEntertainment = (data.state === "ENTERTAINMENT" || data.status?.includes("Entertainment"));
  const isGaming = (data.state === "GAMING" || data.status === "Alert/Game" || data.status?.includes("Gaming") || data.state?.includes("GAMING"));
  const isViolation = isTrading || isEntertainment || isGaming;
  const isIdle = (data.status === "Idle" || data.state === "IDLE");
  const isOffline = (!data.connected || data.status === "Offline");

  const prevData = state.clients.get(clientId);
  const prevViolation = prevData && (prevData.state === "TRADING" || prevData.state === "ENTERTAINMENT" || prevData.state === "GAMING" || prevData.status === "Alert/Game");
  const justTriggeredAlert = isViolation && !prevViolation;

  state.clients.set(clientId, data);

  if (justTriggeredAlert) {
    playAlertChime();
  }

  const hostname = data.hostname || clientId;
  const username = data.username || "User";
  const department = data.department || "Engineering";
  const windowTitle = data.window || "Desktop / Background";
  const cpuPercent = data.cpu_percent !== undefined ? data.cpu_percent : 12;
  const ramPercent = data.ram_percent !== undefined ? data.ram_percent : 45;
  const hasGamepad = Boolean(data.gamepad_connected);

  let badgeClass = "badge-normal";
  let badgeText = "Work";
  let statusClass = "normal";

  if (isTrading) {
    badgeClass = "bg-amber-500/20 text-amber-300 border border-amber-500/40";
    badgeText = "📈 Trading";
    statusClass = "alert";
  } else if (isEntertainment) {
    badgeClass = "bg-purple-500/20 text-purple-300 border border-purple-500/40";
    badgeText = "🍿 Entertainment";
    statusClass = "alert";
  } else if (isGaming) {
    badgeClass = "badge-alert";
    badgeText = data.state === "BACKGROUND_GAMING" ? "Alt+Tab Game" : "🎮 Gaming";
    statusClass = "alert";
  } else if (isIdle) {
    badgeClass = "badge-idle";
    badgeText = "AFK / Idle";
    statusClass = "idle";
  } else if (isOffline) {
    badgeClass = "badge-offline";
    badgeText = "Offline";
    statusClass = "offline";
  }


  if (!card) {
    card = document.createElement("div");
    card.id = `card-${clientId}`;
    card.className = `client-card glass-panel overflow-hidden border border-slate-800 hover:border-slate-700 transition flex flex-col ${statusClass}`;
    card.innerHTML = `
      <div class="px-3.5 py-2.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
        <div class="flex items-center space-x-2 min-w-0">
          <span class="status-dot ${statusClass}" id="dot-${clientId}"></span>
          <div class="truncate">
            <h4 class="text-xs font-bold text-white mono-font truncate" id="host-${clientId}">${escapeHtml(hostname)}</h4>
            <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span id="user-${clientId}">${escapeHtml(username)}</span>
              <span>•</span>
              <span class="text-indigo-400 font-semibold" id="dept-${clientId}">${escapeHtml(department)}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center space-x-1">
          <span id="gamepad-badge-${clientId}" class="${hasGamepad ? '' : 'hidden'} text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">🎮</span>
          <span id="badge-${clientId}" class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">${badgeText}</span>
        </div>
      </div>

      <div class="aspect-video bg-black/90 relative overflow-hidden group cursor-pointer" onclick="openInspector('${clientId}')">
        <img id="img-${clientId}" src="${data.screenshot ? 'data:image/jpeg;base64,' + data.screenshot : ''}" alt="${escapeHtml(hostname)}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        <div class="absolute inset-0 bg-indigo-950/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <span class="bg-slate-900/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-700 shadow-lg">Click to Inspect</span>
        </div>
      </div>

      <div class="p-3 bg-slate-950/50 space-y-2 flex-1 flex flex-col justify-between text-xs">
        <div>
          <div class="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span class="uppercase tracking-wider font-semibold">Active Window</span>
            <span class="mono-font text-slate-500" id="time-${clientId}">Just now</span>
          </div>
          <p id="win-${clientId}" class="text-slate-200 text-xs font-medium truncate" title="${escapeHtml(windowTitle)}">${escapeHtml(windowTitle)}</p>
        </div>

        <!-- CPU & RAM Progress Bars -->
        <div class="pt-2 border-t border-slate-800/80 space-y-1 text-[10px]">
          <div class="flex justify-between items-center text-slate-400">
            <span>CPU</span>
            <span class="mono-font text-emerald-400 font-semibold" id="cpu-${clientId}">${cpuPercent}%</span>
          </div>
          <div class="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
            <div id="cpu-bar-${clientId}" class="bg-emerald-500 h-1 rounded-full" style="width: ${Math.min(100, cpuPercent)}%"></div>
          </div>
          <div class="flex justify-between items-center text-slate-400 pt-0.5">
            <span>RAM</span>
            <span class="mono-font text-indigo-400 font-semibold" id="ram-${clientId}">${ramPercent}%</span>
          </div>
          <div class="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
            <div id="ram-bar-${clientId}" class="bg-indigo-500 h-1 rounded-full" style="width: ${Math.min(100, ramPercent)}%"></div>
          </div>
        </div>

        <!-- One-Click Quick Actions -->
        <div class="flex space-x-1.5 pt-1.5">
          <button onclick="quickKill('${clientId}')" class="flex-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-200 py-1 rounded text-[11px] font-semibold transition cursor-pointer">
            🛑 Kill
          </button>
          <button onclick="quickWarn('${clientId}')" class="flex-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/60 text-amber-200 py-1 rounded text-[11px] font-semibold transition cursor-pointer">
            ⚠️ Warn
          </button>
        </div>
      </div>
    `;

    const grid = document.getElementById("client-grid");
    if (grid) grid.appendChild(card);
  } else {
    // Keyed Targeted DOM Updates (Zero destruction!)
    const imgEl = document.getElementById(`img-${clientId}`);
    if (imgEl && data.screenshot) {
      imgEl.src = "data:image/jpeg;base64," + data.screenshot;
    }

    const dotEl = document.getElementById(`dot-${clientId}`);
    if (dotEl) dotEl.className = `status-dot ${statusClass}`;

    const badgeEl = document.getElementById(`badge-${clientId}`);
    if (badgeEl) {
      badgeEl.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`;
      badgeEl.textContent = badgeText;
    }

    const winEl = document.getElementById(`win-${clientId}`);
    if (winEl) {
      winEl.textContent = windowTitle;
      winEl.title = windowTitle;
    }

    const userEl = document.getElementById(`user-${clientId}`);
    if (userEl) userEl.textContent = username;

    const deptEl = document.getElementById(`dept-${clientId}`);
    if (deptEl) deptEl.textContent = department;

    const timeEl = document.getElementById(`time-${clientId}`);
    if (timeEl && data.last_seen) {
      timeEl.textContent = timeAgo(data.last_seen);
    }

    const cpuEl = document.getElementById(`cpu-${clientId}`);
    const cpuBar = document.getElementById(`cpu-bar-${clientId}`);
    if (cpuEl) cpuEl.textContent = `${cpuPercent}%`;
    if (cpuBar) cpuBar.style.width = `${Math.min(100, cpuPercent)}%`;

    const ramEl = document.getElementById(`ram-${clientId}`);
    const ramBar = document.getElementById(`ram-bar-${clientId}`);
    if (ramEl) ramEl.textContent = `${ramPercent}%`;
    if (ramBar) ramBar.style.width = `${Math.min(100, ramPercent)}%`;

    const gpBadge = document.getElementById(`gamepad-badge-${clientId}`);
    if (gpBadge) {
      gpBadge.className = hasGamepad ? 'text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'hidden';
    }
  }

  updateFleetStatsCounters();
}

function updateFleetStatsCounters() {
  let total = state.clients.size;
  let alerts = 0;
  let normal = 0;
  let idle = 0;

  state.clients.forEach(c => {
    const isViolation = (c.state === "TRADING" || c.state === "ENTERTAINMENT" || c.state === "GAMING" || c.status === "Alert/Game" || c.status?.includes("Trading") || c.status?.includes("Entertainment") || c.status?.includes("Gaming"));
    if (isViolation) alerts++;
    else if (c.status === "Idle" || c.state === "IDLE") idle++;
    else normal++;
  });


  const totalEl = document.getElementById("stat-total");
  const alertsEl = document.getElementById("stat-alerts");
  const normalEl = document.getElementById("stat-normal");
  const healthEl = document.getElementById("stat-health-score");

  if (totalEl) totalEl.textContent = total;
  if (alertsEl) alertsEl.textContent = alerts;
  if (normalEl) normalEl.textContent = normal;

  if (healthEl && total > 0) {
    const score = Math.max(0, Math.min(100, Math.round(100 - ((alerts / total) * 100 * 1.5) - ((idle / total) * 100 * 0.5))));
    healthEl.textContent = `${score}%`;
  }
}

// ============================================================================
// WebSocket Unified Stream
// ============================================================================
let ws = null;
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/live`;

  const ind = document.getElementById("ws-status-indicator");
  const txt = document.getElementById("ws-status-text");

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (ind) ind.className = "status-dot active";
      if (txt) txt.textContent = "CONNECTED (LIVE)";
    };

    ws.onmessage = (event) => {
      state.stats.framesReceived++;
      state.stats.bytesReceived += event.data.length;

      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "snapshot" && msg.clients) {
          Object.entries(msg.clients).forEach(([cid, cdata]) => {
            updateOrCreateCard(cid, cdata);
          });
          applyFilters();
        } else if (msg.type === "client_update" && msg.client_id) {
          updateOrCreateCard(msg.client_id, msg.data);
          // If inspector modal is open for this client, stream the HD frame live
          if (state.modalClientId === msg.client_id && msg.data.screenshot) {
            const mImg = document.getElementById("modal-img");
            if (mImg) mImg.src = "data:image/jpeg;base64," + msg.data.screenshot;
            const mWin = document.getElementById("modal-window");
            if (mWin) mWin.textContent = msg.data.window || "Desktop";
          }
        } else if (msg.type === "client_offline" && msg.client_id) {

          const c = state.clients.get(msg.client_id);
          if (c) {
            c.connected = false;
            c.status = "Offline";
            updateOrCreateCard(msg.client_id, c);
          }
        } else if (msg.type === "fleet_reset") {
          window.location.reload();
        }
      } catch (err) {
        console.error("WS Parse:", err);
      }
    };

    ws.onclose = () => {
      if (ind) ind.className = "status-dot offline";
      if (txt) txt.textContent = "RECONNECTING...";
      setTimeout(initWebSocket, 3000);
    };

    ws.onerror = () => {
      if (ind) ind.className = "status-dot alert";
    };
  } catch (e) {
    setTimeout(initWebSocket, 3000);
  }
}

// Throughput and Bandwidth Monitor
function startThroughputMonitor() {
  let prevBytes = 0;
  let prevFrames = 0;
  setInterval(() => {
    const dBytes = state.stats.bytesReceived - prevBytes;
    const dFrames = state.stats.framesReceived - prevFrames;
    prevBytes = state.stats.bytesReceived;
    prevFrames = state.stats.framesReceived;

    const kbps = Math.round(dBytes / 1024);
    const bwEl = document.getElementById("stat-bandwidth");
    if (bwEl) bwEl.textContent = `${kbps} KB/s`;
  }, 1000);
}

// ============================================================================
// Shift Scheduler Banner Updates
// ============================================================================
async function pollShiftStatus() {
  try {
    const res = await fetch("/api/shift/status");
    const shift = await res.json();

    const badge = document.getElementById("shift-badge");
    const countEl = document.getElementById("shift-countdown");
    const bar = document.getElementById("shift-progress-bar");

    if (badge && countEl && bar) {
      if (shift.is_lunch) {
        badge.className = "px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30";
        badge.textContent = "🥪 LUNCH GRACE";
      } else if (shift.in_shift) {
        badge.className = "px-2 py-0.5 rounded-md font-bold text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
        badge.textContent = "🕒 SHIFT ACTIVE";
      } else {
        badge.className = "px-2 py-0.5 rounded-md font-bold text-[10px] bg-slate-700 text-slate-300";
        badge.textContent = "💤 STANDBY";
      }

      countEl.textContent = shift.countdown_text || "09:30 - 17:30";
      bar.style.width = `${shift.progress_percent || 0}%`;
    }
  } catch (e) {
    console.warn("Shift poll error:", e);
  }
}

// ============================================================================
// 1-Click Simulator Actions
// ============================================================================
async function triggerSim(testType) {
  try {
    const res = await fetch("/api/simulator/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: testType })
    });
    const data = await res.json();
    playAlertChime();
    console.log("[Simulator]", data.message);
  } catch (e) {
    console.error("Simulator error:", e);
  }
}

async function resetSim() {
  try {
    await fetch("/api/simulator/reset", { method: "POST" });
  } catch (e) {
    console.error("Reset error:", e);
  }
}

// ============================================================================
// Focused Workstation Tab Logic
// ============================================================================
function populateFocusSelect() {
  const select = document.getElementById("focus-select-ws");
  if (!select) return;
  select.innerHTML = "";
  state.clients.forEach((c, cid) => {
    const opt = document.createElement("option");
    opt.value = cid;
    opt.textContent = `${c.hostname || cid} (${c.username || 'User'}) - ${c.department || 'Engineering'}`;
    select.appendChild(opt);
  });
  if (state.focusedClientId) {
    select.value = state.focusedClientId;
  }
  select.onchange = () => {
    state.focusedClientId = select.value;
    refreshFocusStation();
  };
}

async function refreshFocusStation() {
  const select = document.getElementById("focus-select-ws");
  const wsId = (select && select.value) || state.focusedClientId || Array.from(state.clients.keys())[0];
  if (!wsId) return;

  try {
    const res = await fetch(`/api/fleet/${wsId}`);
    const data = await res.json();

    document.getElementById("focus-host").textContent = data.hostname || wsId;
    document.getElementById("focus-user").textContent = data.username || "User";
    document.getElementById("focus-dept").textContent = data.department || "Engineering";
    document.getElementById("focus-ip").textContent = data.ip || "192.168.1.1";
    document.getElementById("focus-app").textContent = data.active_window || "Desktop";

    const isGaming = (data.status === "Alert/Game" || (data.state && (data.state.includes("GAMING") || data.state === "GAMING")));
    const stEl = document.getElementById("focus-state");
    stEl.className = isGaming
      ? "px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30"
      : "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    stEl.textContent = isGaming ? "🚨 GAMING" : "WORK";

    document.getElementById("focus-cpu").textContent = `${data.cpu_percent || 12}%`;
    document.getElementById("focus-ram").textContent = `${data.ram_percent || 45}%`;
    document.getElementById("focus-idle").textContent = `${data.idle_seconds || 0}s`;
    document.getElementById("focus-gamepad").textContent = data.gamepad_connected ? "🎮 Active Gamepad" : "None";

    const img = document.getElementById("focus-img");
    const placeholder = document.getElementById("focus-img-placeholder");
    const liveShot = data.live_data?.screenshot || data.screenshot;
    if (liveShot) {
      img.src = "data:image/jpeg;base64," + liveShot;
      img.classList.remove("hidden");
      if (placeholder) placeholder.classList.add("hidden");
    } else {
      img.classList.add("hidden");
      if (placeholder) placeholder.classList.remove("hidden");
    }
  } catch (e) {
    console.error("Focus station error:", e);
  }
}

async function dispatchDirectKill() {
  const wsId = document.getElementById("focus-select-ws")?.value || state.focusedClientId;
  const input = document.getElementById("action-kill-input");
  const target = input ? input.value.trim() : "";
  if (!wsId) return alert("Select a workstation first.");
  if (!target) return alert("Enter a process name or PID to kill.");

  const res = await fetch("/api/commands/kill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workstation_id: wsId, process: target })
  });
  const data = await res.json();
  alert(data.message || "Kill instruction queued.");
}

async function dispatchDirectWarn() {
  const wsId = document.getElementById("focus-select-ws")?.value || state.focusedClientId;
  const input = document.getElementById("action-warn-input");
  const msg = input ? input.value.trim() : "";
  if (!wsId) return alert("Select a workstation first.");

  const res = await fetch("/api/commands/warn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workstation_id: wsId, message: msg })
  });
  const data = await res.json();
  alert(data.message || "Warning modal dispatched.");
}

// ============================================================================
// Incidents Feed & Evidence Lightbox
// ============================================================================
async function loadIncidents() {
  const tbody = document.getElementById("incidents-table-body");
  if (!tbody) return;
  try {
    const res = await fetch("/api/violations?limit=50");
    const data = await res.json();
    tbody.innerHTML = "";

    const countBadge = document.getElementById("badge-incident-count");
    if (countBadge) countBadge.textContent = data.count || 0;

    data.violations.forEach(v => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/40 transition";
      const isResolved = v.status === "RESOLVED";
      const startDt = v.started_at ? new Date(v.started_at * 1000).toLocaleString() : (v.timestamp ? new Date(v.timestamp * 1000).toLocaleString() : 'N/A');
      const lastDt = v.last_detected_at ? new Date(v.last_detected_at * 1000).toLocaleString() : (v.timestamp ? new Date(v.timestamp * 1000).toLocaleString() : 'N/A');

      // Format clean uptime duration
      const durSec = v.duration_seconds || 1;
      let durStr = `${durSec}s`;
      if (durSec >= 60) {
        const m = Math.floor(durSec / 60);
        const s = durSec % 60;
        durStr = `${m}m ${s}s`;
      }

      const verdict = v.ai_verdict || 'GAMING';
      let verdictBadge = "bg-rose-500/20 text-rose-300 border border-rose-500/30";
      if (verdict === "TRADING") verdictBadge = "bg-amber-500/20 text-amber-300 border border-amber-500/30";
      else if (verdict === "ENTERTAINMENT") verdictBadge = "bg-purple-500/20 text-purple-300 border border-purple-500/30";

      tr.innerHTML = `
        <td class="p-3 mono-font text-slate-500">#${v.id}</td>
        <td class="p-3 mono-font text-slate-400 whitespace-nowrap">${startDt}</td>
        <td class="p-3 mono-font text-slate-300 whitespace-nowrap">${lastDt}</td>
        <td class="p-3 font-bold text-white mono-font">${escapeHtml(v.workstation_id)}</td>
        <td class="p-3 text-slate-300">${escapeHtml(v.username || 'User')}</td>
        <td class="p-3 font-semibold text-rose-400 max-w-xs truncate" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</td>
        <td class="p-3 mono-font font-bold text-amber-400">${durStr}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${verdictBadge}">${escapeHtml(verdict)}</span></td>
        <td class="p-3">
          ${v.evidence_b64 ? `<button onclick="openLightbox('${v.id}')" class="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition shadow flex items-center gap-1 cursor-pointer"><span>📸</span> View Proofs</button>` : '<span class="text-slate-600 italic">None</span>'}
        </td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isResolved ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
            ${v.status}
          </span>
        </td>
        <td class="p-3 text-right">
          ${!isResolved ? `<button onclick="resolveViolation(${v.id})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition cursor-pointer">Resolve</button>` : '<span class="text-emerald-400 text-[11px]">✓ Cleared</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (e) {
    console.error("Incidents load error:", e);
  }
}

async function resolveViolation(id) {
  await fetch(`/api/violations/${id}/resolve`, { method: "POST" });
  loadIncidents();
}

let activeViolationData = null;

async function openLightbox(violationId) {
  try {
    const res = await fetch(`/api/violations/${violationId}`);
    const v = await res.json();
    if (!v.evidence_b64 && !v.last_evidence_b64) return alert("No proof image recorded for this incident.");

    activeViolationData = v;

    const startDt = v.started_at ? new Date(v.started_at * 1000).toLocaleString() : (v.timestamp ? new Date(v.timestamp * 1000).toLocaleString() : 'N/A');
    const lastDt = v.last_detected_at ? new Date(v.last_detected_at * 1000).toLocaleString() : (v.timestamp ? new Date(v.timestamp * 1000).toLocaleString() : 'N/A');
    const durSec = v.duration_seconds || 1;

    document.getElementById("lb-first-time").textContent = startDt;
    document.getElementById("lb-last-time").textContent = lastDt;
    document.getElementById("lb-uptime").textContent = durSec >= 60 ? `${Math.floor(durSec/60)}m ${durSec%60}s` : `${durSec}s`;

    document.getElementById("lightbox-title").textContent = `Forensic Proof #${v.id} - ${v.workstation_id} (${v.username || 'User'})`;
    document.getElementById("lightbox-subtitle").textContent = `Logged Site/App: ${v.title} | Category: ${v.ai_verdict || 'Violation'}`;

    // Show first detection by default
    switchLightboxTab('first');

    document.getElementById("lightbox-modal").classList.remove("hidden");
    document.getElementById("lightbox-modal").classList.add("flex");
  } catch (e) {
    console.error(e);
  }
}

function switchLightboxTab(tab) {
  if (!activeViolationData) return;
  const btnFirst = document.getElementById("btn-proof-first");
  const btnLast = document.getElementById("btn-proof-last");
  const imgEl = document.getElementById("lightbox-img");
  const dlBtn = document.getElementById("lightbox-download-btn");

  const b64 = (tab === 'last' && activeViolationData.last_evidence_b64) 
    ? activeViolationData.last_evidence_b64 
    : (activeViolationData.evidence_b64 || activeViolationData.last_evidence_b64);

  const imgSrc = "data:image/jpeg;base64," + b64;
  imgEl.src = imgSrc;

  if (dlBtn) {
    dlBtn.href = imgSrc;
    dlBtn.download = `proof_${activeViolationData.workstation_id}_#${activeViolationData.id}_${tab}.jpg`;
  }

  if (tab === 'first') {
    btnFirst.className = "px-3 py-1 rounded-lg font-bold text-xs bg-indigo-600 text-white shadow transition cursor-pointer";
    btnLast.className = "px-3 py-1 rounded-lg font-bold text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer";
  } else {
    btnLast.className = "px-3 py-1 rounded-lg font-bold text-xs bg-indigo-600 text-white shadow transition cursor-pointer";
    btnFirst.className = "px-3 py-1 rounded-lg font-bold text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer";
  }
}


function closeLightbox() {
  const modal = document.getElementById("lightbox-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

// ============================================================================
// Analytics Tab (Chart.js Integration)
// ============================================================================
async function loadAnalytics() {
  try {
    const [healthRes, hourlyRes, topGamesRes] = await Promise.all([
      fetch("/api/analytics/health"),
      fetch("/api/analytics/hourly"),
      fetch("/api/analytics/top-games")
    ]);
    const health = await healthRes.json();
    const hourly = await hourlyRes.json();
    const topGames = await topGamesRes.json();

    document.getElementById("analytic-work-pct").textContent = `${health.work_pct}%`;
    document.getElementById("analytic-game-pct").textContent = `${health.gaming_pct}%`;
    document.getElementById("analytic-idle-pct").textContent = `${health.idle_pct}%`;

    // Render Donut Chart
    const donutCtx = document.getElementById("chart-state-donut")?.getContext("2d");
    if (donutCtx) {
      if (donutChart) donutChart.destroy();
      donutChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Productive Work', 'Gaming / Slacking', 'Idle / AFK'],
          datasets: [{
            data: [health.work_pct, health.gaming_pct, health.idle_pct],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          cutout: '72%'
        }
      });
    }

    // Render Hourly Stacked Bar
    const hourlyCtx = document.getElementById("chart-hourly-bar")?.getContext("2d");
    if (hourlyCtx) {
      if (hourlyBarChart) hourlyBarChart.destroy();
      hourlyBarChart = new Chart(hourlyCtx, {
        type: 'bar',
        data: {
          labels: hourly.hours,
          datasets: [
            { label: 'Work', data: hourly.work, backgroundColor: '#10b981', stack: 'Stack 0' },
            { label: 'Gaming', data: hourly.gaming, backgroundColor: '#ef4444', stack: 'Stack 0' },
            { label: 'Idle', data: hourly.idle, backgroundColor: '#f59e0b', stack: 'Stack 0' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          },
          plugins: { legend: { labels: { color: '#cbd5e1' } } }
        }
      });
    }

    // Top Games
    const topContainer = document.getElementById("top-games-container");
    if (topContainer) {
      topContainer.innerHTML = "";
      if (!topGames || topGames.length === 0) {
        topContainer.innerHTML = `<div class="col-span-full text-center py-6 text-slate-500 text-xs italic">No unauthorized gaming or slacking activities detected across the fleet. All workstations are compliant.</div>`;
      } else {
        topGames.forEach((g, idx) => {
          const card = document.createElement("div");
          card.className = "bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-1";
          card.innerHTML = `
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-rose-400">#${idx + 1} ${escapeHtml(g.title)}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">${g.count} Hits</span>
            </div>
            <span class="text-[11px] text-slate-400">Cumulative Time: ${Math.round((g.total_duration || 0) / 60)} mins</span>
          `;
          topContainer.appendChild(card);
        });
      }
    }

    // Also load employee reports for the selected date
    await loadDailyEmployeeReports();
  } catch (e) {
    console.error("Analytics load error:", e);
  }
}

// ============================================================================
// 200+ Employee Daily Reports & Forensics Engine
// ============================================================================
let cachedDailyReports = [];
let currentReportDate = new Date().toISOString().split("T")[0];

async function loadDailyEmployeeReports(targetDate = null) {
  try {
    if (targetDate) {
      currentReportDate = targetDate;
    }
    const dateInput = document.getElementById("report-date-input");
    if (dateInput && !dateInput.value) {
      dateInput.value = currentReportDate;
    } else if (dateInput && targetDate) {
      dateInput.value = targetDate;
    }

    const res = await fetch(`/api/reports/daily?date=${currentReportDate}`);
    const data = await res.json();
    cachedDailyReports = data.reports || [];

    // Calculate Fleet KPIs
    const totalEmp = cachedDailyReports.length;
    let totalActiveSec = 0;
    let totalViols = 0;
    let scoreSum = 0;

    cachedDailyReports.forEach(r => {
      totalActiveSec += (r.active_seconds || 0);
      totalViols += (r.violations_count || 0);
      scoreSum += (r.productivity_score || 100);
    });

    const avgScore = totalEmp > 0 ? Math.round(scoreSum / totalEmp) : 100;
    const totalActiveHrs = Math.floor(totalActiveSec / 3600);
    const totalActiveMins = Math.floor((totalActiveSec % 3600) / 60);

    const kpiEmp = document.getElementById("rep-kpi-total-emp");
    const kpiActive = document.getElementById("rep-kpi-total-active");
    const kpiViols = document.getElementById("rep-kpi-total-viols");
    const kpiScore = document.getElementById("rep-kpi-avg-score");

    if (kpiEmp) kpiEmp.textContent = totalEmp;
    if (kpiActive) kpiActive.textContent = `${totalActiveHrs}h ${totalActiveMins}m`;
    if (kpiViols) kpiViols.textContent = totalViols;
    if (kpiScore) {
      kpiScore.textContent = `${avgScore}%`;
      kpiScore.className = `text-lg font-bold mono-font ${avgScore >= 85 ? 'text-emerald-400' : avgScore >= 65 ? 'text-amber-400' : 'text-rose-400'}`;
    }

    renderDailyReportsTable(cachedDailyReports);
  } catch (e) {
    console.error("Daily report fetch error:", e);
  }
}

function renderDailyReportsTable(reports) {
  const tbody = document.getElementById("daily-reports-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!reports || reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500 italic">No employee workstations logged for this date. Run simulator or start agents to record attendance.</td></tr>`;
    return;
  }

  reports.forEach(r => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-800/40 transition border-b border-slate-800/40";

    const score = r.productivity_score || 100;
    const scoreColor = score >= 85 ? "text-emerald-400" : score >= 65 ? "text-amber-400" : "text-rose-400";
    const scoreBg = score >= 85 ? "bg-emerald-500" : score >= 65 ? "bg-amber-500" : "bg-rose-500";

    const hasViolations = (r.violations_count || 0) > 0;
    const violBadge = hasViolations 
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">${r.violations_count} Flaggable</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">0 Clean</span>`;

    const violTimeBadge = hasViolations
      ? `<span class="text-rose-400 font-bold mono-font">${escapeHtml(r.violation_formatted || '0s')}</span>`
      : `<span class="text-slate-500 mono-font">0s</span>`;

    tr.innerHTML = `
      <td class="p-3">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[10px] text-indigo-300">
            ${(r.employee_name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <span class="font-bold text-white block">${escapeHtml(r.employee_name)}</span>
            <span class="text-[10px] text-slate-500 mono-font">${escapeHtml(r.employee_id || r.workstation_id)}</span>
          </div>
        </div>
      </td>
      <td class="p-3">
        <span class="mono-font text-slate-300 block text-[11px]">${escapeHtml(r.workstation_id)}</span>
        <span class="text-[10px] text-slate-500">${escapeHtml(r.designation || 'Staff')}</span>
      </td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/70 border border-indigo-700/40 text-indigo-300">
          ${escapeHtml(r.department)}
        </span>
      </td>
      <td class="p-3 font-semibold text-emerald-400 mono-font">${escapeHtml(r.active_formatted)}</td>
      <td class="p-3 text-amber-300 mono-font">${escapeHtml(r.idle_formatted)}</td>
      <td class="p-3">${violTimeBadge}</td>
      <td class="p-3">${violBadge}</td>
      <td class="p-3">
        <div class="flex items-center space-x-2">
          <span class="font-bold mono-font ${scoreColor}">${score}%</span>
          <div class="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden hidden sm:block">
            <div class="${scoreBg} h-full rounded-full" style="width: ${score}%"></div>
          </div>
        </div>
      </td>
      <td class="p-3 text-right">
        <button onclick="openEmployeeAuditModal('${escapeHtml(r.workstation_id)}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-semibold text-[11px] transition cursor-pointer flex items-center gap-1 ml-auto">
          <span>🔍</span>
          <span>Audit Log</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterEmployeeReports() {
  const dept = document.getElementById("report-dept-filter")?.value || "all";
  const query = (document.getElementById("report-search-input")?.value || "").toLowerCase().trim();

  const filtered = cachedDailyReports.filter(r => {
    const matchDept = (dept === "all" || (r.department && r.department.toLowerCase() === dept.toLowerCase()));
    const matchQuery = !query || 
      (r.employee_name && r.employee_name.toLowerCase().includes(query)) ||
      (r.employee_id && r.employee_id.toLowerCase().includes(query)) ||
      (r.workstation_id && r.workstation_id.toLowerCase().includes(query));
    return matchDept && matchQuery;
  });

  renderDailyReportsTable(filtered);
}

function onReportDateChanged() {
  const input = document.getElementById("report-date-input");
  if (input && input.value) {
    loadDailyEmployeeReports(input.value);
  }
}

async function openEmployeeAuditModal(workstationId) {
  try {
    const res = await fetch(`/api/reports/employee/${workstationId}?date=${currentReportDate}`);
    const data = await res.json();

    document.getElementById("ea-modal-title").textContent = `Forensic Timeline: ${data.employee_name || workstationId}`;
    document.getElementById("ea-modal-subtitle").textContent = `Workstation: ${workstationId} • Department: ${data.department || 'Technology'} • Designation: ${data.designation || 'Staff'}`;
    document.getElementById("ea-modal-total-count").textContent = data.total_violations_count || 0;
    document.getElementById("ea-modal-total-duration").textContent = data.total_violation_formatted || "0s";
    document.getElementById("ea-modal-date").textContent = data.date || currentReportDate;

    const listEl = document.getElementById("ea-modal-violations-list");
    listEl.innerHTML = "";

    const viols = data.violations || [];
    if (viols.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800/80 space-y-2">
          <span class="text-2xl block">✅</span>
          <span class="text-emerald-400 font-bold text-xs block">100% Policy Compliant</span>
          <p class="text-slate-400 text-[11px]">No unauthorized gaming, trading, or gambling infractions logged for this employee on ${data.date}.</p>
        </div>
      `;
    } else {
      viols.forEach((v, idx) => {
        const item = document.createElement("div");
        item.className = "bg-slate-950/80 p-3.5 rounded-xl border border-rose-500/30 space-y-2";
        item.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 font-bold flex items-center justify-center text-[10px]">#${idx + 1}</span>
              <span class="font-bold text-white text-xs">${escapeHtml(v.title)}</span>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-700/50 mono-font">${escapeHtml(v.process_name)}</span>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 mono-font">
              ⏱️ Duration: ${escapeHtml(v.duration_formatted)}
            </span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
            <div><span class="text-slate-500 block">Started:</span> <span class="text-slate-200 mono-font">${escapeHtml(v.started_at)}</span></div>
            <div><span class="text-slate-500 block">Ended:</span> <span class="text-slate-200 mono-font">${escapeHtml(v.ended_at)}</span></div>
            <div><span class="text-slate-500 block">Rule:</span> <span class="text-indigo-300">${escapeHtml(v.rule_type)}</span></div>
            <div><span class="text-slate-500 block">AI Classification:</span> <span class="text-amber-300 font-bold">${escapeHtml(v.ai_verdict)}</span></div>
          </div>
        `;
        listEl.appendChild(item);
      });
    }

    const modal = document.getElementById("employee-audit-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  } catch (e) {
    console.error("Audit modal error:", e);
  }
}

function closeEmployeeAuditModal() {
  const modal = document.getElementById("employee-audit-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function exportReportsCSV() {
  const dateInput = document.getElementById("report-date-input");
  const targetDate = (dateInput && dateInput.value) || currentReportDate || new Date().toISOString().split("T")[0];
  window.location.href = `/api/reports/export/csv?date=${targetDate}`;
}

// ============================================================================
// Bulk Actions
// ============================================================================
async function bulkWarnSlacking() {
  if (!confirm("Send warning notifications to ALL slacking and idle employee PCs?")) return;
  const res = await fetch("/api/commands/bulk-warn-slacking", { method: "POST" });
  const data = await res.json();
  alert(`Dispatched warning popups to ${data.warned_count} workstations.`);
}

async function bulkKillGaming() {
  if (!confirm("EMERGENCY ENFORCEMENT: Terminate unauthorized games across ALL fleet workstations immediately?")) return;
  const res = await fetch("/api/commands/bulk-kill-gaming", { method: "POST" });
  const data = await res.json();
  alert(`Dispatched remote termination to ${data.killed_count} active game processes.`);
}

// Quick Actions from Fleet Card
async function quickKill(clientId) {
  const c = state.clients.get(clientId);
  // Prefer real process_name, PID, or active window keyword
  const target = c?.process_name || (c?.pid ? String(c.pid) : "") || c?.window || "";
  if (!target || target === ".exe") {
    alert(`No active process or window detected for ${clientId}. Use 'Focused Workstation' tab to enter the process name manually.`);
    return;
  }
  try {
    const res = await fetch("/api/commands/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workstation_id: clientId, process: target })
    });
    const data = await res.json();
    const directNote = data.direct_sent ? " [Delivered Instantly]" : " [Queued]";
    alert(`🛑 Kill command dispatched to ${clientId} → terminating "${target}" ${directNote}`);
  } catch (err) {
    alert(`❌ Failed to send kill command: ${err}`);
  }
}

async function quickWarn(clientId) {
  const c = state.clients.get(clientId);
  const username = c?.username || clientId;
  try {
    const res = await fetch("/api/commands/warn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workstation_id: clientId, message: `Compliance Notice: Please focus on official work tasks, ${username}.` })
    });
    const data = await res.json();
    const directNote = data.direct_sent ? " [Delivered Instantly]" : " [Queued]";
    alert(`⚠️ Warning popup sent to ${username} (${clientId}) ${directNote}`);
  } catch (err) {
    alert(`❌ Failed to send warning: ${err}`);
  }
}

// ============================================================================
// Policy Rules Management
// ============================================================================
async function loadRules() {
  const tbody = document.getElementById("rules-table-body");
  if (!tbody) return;
  try {
    const res = await fetch("/api/rules");
    const data = await res.json();
    tbody.innerHTML = "";
    data.rules.forEach(r => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/40 transition";
      tr.innerHTML = `
        <td class="p-2.5 font-bold text-white">${escapeHtml(r.name)}</td>
        <td class="p-2.5 text-slate-400">${r.rule_type}</td>
        <td class="p-2.5 mono-font text-indigo-400">${escapeHtml(r.pattern)}</td>
        <td class="p-2.5 font-semibold text-rose-400">${r.action}</td>
        <td class="p-2.5">
          <button onclick="toggleRule(${r.id})" class="px-2 py-0.5 rounded text-[10px] font-bold ${r.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}">
            ${r.enabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </td>
        <td class="p-2.5 text-right">
          <button onclick="deleteRule(${r.id})" class="text-rose-400 hover:text-rose-300 font-bold">×</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
  }
}

async function addCustomRule() {
  const name = document.getElementById("new-rule-name")?.value.trim();
  const rule_type = document.getElementById("new-rule-type")?.value;
  const pattern = document.getElementById("new-rule-pattern")?.value.trim();
  if (!pattern) return alert("Please enter rule pattern.");

  await fetch("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || pattern, rule_type, pattern, action: "ALERT" })
  });

  document.getElementById("new-rule-name").value = "";
  document.getElementById("new-rule-pattern").value = "";
  loadRules();
}

async function toggleRule(id) {
  await fetch(`/api/rules/${id}/toggle`, { method: "PUT" });
  loadRules();
}

async function deleteRule(id) {
  await fetch(`/api/rules/${id}`, { method: "DELETE" });
  loadRules();
}

async function saveShiftConfig() {
  const start = document.getElementById("cfg-shift-start")?.value;
  const end = document.getElementById("cfg-shift-end")?.value;
  const l_start = document.getElementById("cfg-lunch-start")?.value;
  const l_end = document.getElementById("cfg-lunch-end")?.value;

  await fetch("/api/shift/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shift_start: start,
      shift_end: end,
      lunch_start: l_start,
      lunch_end: l_end
    })
  });
  alert("Shift schedule saved.");
  pollShiftStatus();
}

// ============================================================================
// NVIDIA NIM AI Vision Settings
// ============================================================================
async function loadNimSettings() {
  try {
    const res = await fetch("/api/nim/config");
    const data = await res.json();
    const keyStatus = document.getElementById("nim-key-status");
    if (keyStatus) {
      keyStatus.textContent = `Current Key: ${data.masked_key}`;
    }
    const select = document.getElementById("nim-model-select");
    if (select && data.current_model) {
      select.value = data.current_model;
    }
  } catch (e) {
    console.error(e);
  }
}

async function saveNimConfig() {
  const key = document.getElementById("nim-key-input")?.value.trim();
  const model = document.getElementById("nim-model-select")?.value;
  await fetch("/api/nim/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, model })
  });
  alert("NVIDIA NIM Configuration saved.");
  loadNimSettings();
}

async function testNimConnection() {
  const out = document.getElementById("nim-test-output");
  if (out) out.innerHTML = "<span class='text-indigo-400'>Testing connection to NVIDIA NIM API...</span>";

  const key = document.getElementById("nim-key-input")?.value.trim();
  const model = document.getElementById("nim-model-select")?.value;

  const res = await fetch("/api/nim/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, model })
  });
  const data = await res.json();

  if (out) {
    if (data.success) {
      out.innerHTML = `<span class="text-emerald-400 font-bold">✓ Connected to ${escapeHtml(data.model)}</span><p class="text-slate-300 mt-1">Response: ${escapeHtml(data.response)}</p>`;
    } else {
      out.innerHTML = `<span class="text-rose-400 font-bold">✗ Connection Failed</span><p class="text-slate-400 mt-1">${escapeHtml(data.error || 'Check API Key')}</p>`;
    }
  }
}

// ============================================================================
// Inspector Modal
// ============================================================================
function setupModals() {
  const closeBtn = document.getElementById("btn-close-modal");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeInspector);
  }
}

function closeInspector() {
  if (state.modalClientId) {
    // Notify server and client to revert back to normal low-bandwidth buffer
    fetch(`/api/client/${encodeURIComponent(state.modalClientId)}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "normal" })
    }).catch(() => {});
  }
  state.modalClientId = null;
  const modal = document.getElementById("inspection-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function openInspector(clientId) {
  state.modalClientId = clientId;
  const c = state.clients.get(clientId);
  if (!c) return;

  document.getElementById("modal-client-id").textContent = c.hostname || clientId;
  document.getElementById("modal-ip").textContent = c.ip || "192.168.1.1";
  document.getElementById("modal-window").textContent = c.window || "Desktop";
  document.getElementById("modal-seen").textContent = timeAgo(c.last_seen);
  document.getElementById("modal-idle").textContent = `${c.idle_seconds || 0} seconds`;

  const img = document.getElementById("modal-img");
  if (img && c.screenshot) {
    img.src = "data:image/jpeg;base64," + c.screenshot;
  }

  const isTrading = (c.state === "TRADING" || c.status?.includes("Trading"));
  const isEntertainment = (c.state === "ENTERTAINMENT" || c.status?.includes("Entertainment"));
  const isGaming = (c.state === "GAMING" || c.status === "Alert/Game" || c.status?.includes("Gaming"));

  const catTag = document.getElementById("modal-category-tag");
  const modStatus = document.getElementById("modal-status");

  if (isTrading) {
    if (catTag) { catTag.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"; catTag.textContent = "TRADING"; }
    if (modStatus) { modStatus.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"; modStatus.textContent = "🚨 Trading"; }
  } else if (isEntertainment) {
    if (catTag) { catTag.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30"; catTag.textContent = "ENTERTAINMENT"; }
    if (modStatus) { modStatus.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30"; modStatus.textContent = "🍿 Entertainment"; }
  } else if (isGaming) {
    if (catTag) { catTag.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30"; catTag.textContent = "GAMING"; }
    if (modStatus) { modStatus.className = "px-2.5 py-1 rounded-full text-xs font-bold badge-alert"; modStatus.textContent = "🎮 Gaming"; }
  } else {
    if (catTag) { catTag.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300"; catTag.textContent = "WORK"; }
    if (modStatus) { modStatus.className = "px-2.5 py-1 rounded-full text-xs font-bold badge-normal"; modStatus.textContent = "Normal"; }
  }

  // Instruct client to immediately switch to 1080p full-clarity HD mode
  fetch(`/api/client/${encodeURIComponent(clientId)}/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "hd" })
  }).catch(() => {});

  const modal = document.getElementById("inspection-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}


function killFromModal() {
  if (state.modalClientId) {
    quickKill(state.modalClientId);
  }
}

function warnFromModal() {
  if (state.modalClientId) {
    quickWarn(state.modalClientId);
  }
}


// Format relative time helper
function timeAgo(epochSecs) {
  if (!epochSecs) return "Never";
  const diff = Math.floor(Date.now() / 1000 - epochSecs);
  if (diff < 3) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================================
// Connect Guide & Interactive Deployment Generator
// ============================================================================
function openConnectGuideModal() {
  const modal = document.getElementById("connect-guide-modal");
  if (modal) {
    syncModalDeploySnippets();
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeConnectGuideModal() {
  const modal = document.getElementById("connect-guide-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

// Global ESC key listener to close modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeConnectGuideModal();
    closeLightbox();
    const inspModal = document.getElementById("inspection-modal");
    if (inspModal) {
      inspModal.classList.add("hidden");
      inspModal.classList.remove("flex");
    }
  }
});

function updateDeploySnippets() {
  const host = document.getElementById("deploy-cfg-host")?.value.trim() || "10.150.0.6";
  const port = document.getElementById("deploy-cfg-port")?.value.trim() || "8000";
  const dept = document.getElementById("deploy-cfg-dept")?.value || "Engineering";

  // Update download link
  const dlBtn = document.getElementById("btn-download-custom-config");
  if (dlBtn) {
    dlBtn.href = `/download/app_config.json?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&department=${encodeURIComponent(dept)}`;
  }

  // Update PowerShell pre snippet
  const psCmd = document.getElementById("deploy-powershell-cmd");
  if (psCmd) {
    psCmd.textContent = `powershell -Command "mkdir 'C:\\ProgramData\\AnuvadiniDetector' -Force; Invoke-WebRequest -Uri 'http://${host}:${port}/download/ApexMonitor.exe' -OutFile 'C:\\ProgramData\\AnuvadiniDetector\\ApexMonitor.exe'; Invoke-WebRequest -Uri 'http://${host}:${port}/download/app_config.json?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&department=${encodeURIComponent(dept)}' -OutFile 'C:\\ProgramData\\AnuvadiniDetector\\app_config.json'; schtasks /create /tn 'AnuvadiniAgent' /tr 'C:\\ProgramData\\AnuvadiniDetector\\ApexMonitor.exe' /sc onlogon /rl highest /f; Start-Process 'C:\\ProgramData\\AnuvadiniDetector\\ApexMonitor.exe'"`;
  }
}

function syncModalDeploySnippets() {
  const host = document.getElementById("modal-cfg-host")?.value.trim() || "10.150.0.6";
  const port = document.getElementById("modal-cfg-port")?.value.trim() || "8000";
  const dept = document.getElementById("modal-cfg-dept")?.value || "Engineering";

  const dlBtn = document.getElementById("modal-btn-download-config");
  if (dlBtn) {
    dlBtn.href = `/download/app_config.json?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&department=${encodeURIComponent(dept)}`;
  }

  const psCmd = document.getElementById("modal-powershell-cmd");
  if (psCmd) {
    psCmd.textContent = `powershell -Command "mkdir 'C:\\ProgramData\\AnuvadiniDetector' -Force; Invoke-WebRequest -Uri 'http://${host}:${port}/download/ApexMonitor.exe' -OutFile 'C:\\ProgramData\\AnuvadiniDetector\\ApexMonitor.exe'; Invoke-WebRequest -Uri 'http://${host}:${port}/download/app_config.json?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&department=${encodeURIComponent(dept)}' -OutFile 'C:\\ProgramData\\AnuvadiniDetector\\app_config.json'; schtasks /create /tn 'AnuvadiniAgent' /tr 'C:\\ProgramData\\AnuvadiniDetector\\ApexMonitor.exe' /sc onlogon /rl highest /f; Start-Process 'C:\\ProgramData\\AnuvadiniDetector\\ApexMonitor.exe'"`;
  }
}

function copyDeployScript() {
  const text = document.getElementById("deploy-powershell-cmd")?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("btn-copy-deploy");
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = "✓ Copied!";
      btn.className = "bg-emerald-600 text-white px-2.5 py-1 rounded text-[11px] font-semibold";
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.className = "bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer";
      }, 2500);
    }
  });
}

function copyModalDeployScript() {
  const text = document.getElementById("modal-powershell-cmd")?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("btn-copy-modal-deploy");
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = "✓ Copied!";
      btn.className = "bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-semibold";
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.className = "bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-[10px] font-semibold transition cursor-pointer";
      }, 2500);
    }
  });
}

