// LinkedIn Message Tracker - widget flutuante informativo
// Apenas exibe status e contador local. NÃO interage com o LinkedIn.

(() => {
  const WIDGET_ID = "linkedin-message-tracker-widget";
  if (window.top !== window) return; // só no frame principal
  if (document.getElementById(WIDGET_ID)) return;
  if (window.__lmtWidgetBooted) return;
  window.__lmtWidgetBooted = true;

  const TAG = "[LinkedIn Tracker]";

  function todayKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  const host = document.createElement("div");
  host.id = WIDGET_ID;
  host.style.cssText = [
    "all:initial",
    "position:fixed",
    "right:16px",
    "bottom:120px",
    "z-index:2147483000",
    "width:auto",
  ].join(";");

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
      .card {
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 6px 24px rgba(15, 23, 42, 0.16);
        padding: 10px 12px;
        min-width: 168px;
        max-width: 220px;
        font-size: 12px;
        line-height: 1.35;
      }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .title { font-weight: 700; font-size: 12px; letter-spacing: .2px; }
      .min-btn {
        border: none; background: transparent; cursor: pointer; color: #64748b;
        font-size: 14px; line-height: 1; padding: 2px 4px; border-radius: 6px;
      }
      .min-btn:hover { background: #f1f5f9; }
      .status { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-weight: 600; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; flex: none; }
      .ok .dot { background: #16a34a; } .ok { color: #16a34a; }
      .bad .dot { background: #ea580c; } .bad { color: #ea580c; }
      .wait .dot { background: #94a3b8; } .wait { color: #64748b; }
      .count { margin-top: 6px; font-size: 13px; font-weight: 700; color: #1d4ed8; }
      .muted { margin-top: 4px; color: #64748b; font-size: 11px; font-weight: 500; }
      .pill {
        display: flex; align-items: center; gap: 6px; cursor: pointer;
        background: #ffffff; border: 1px solid #e2e8f0; border-radius: 999px;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.16);
        padding: 6px 10px; font-size: 12px; font-weight: 700; color: #0f172a;
      }
      .hidden { display: none; }
    </style>
    <div class="card" id="card">
      <div class="row">
        <span class="title">LinkedIn Tracker</span>
        <button class="min-btn" id="minimize" title="Minimizar" aria-label="Minimizar">—</button>
      </div>
      <div class="status wait" id="status"><span class="dot"></span><span id="status-text">Verificando…</span></div>
      <div class="count" id="count">Hoje: 0</div>
      <div class="muted hidden" id="seller"></div>
      <div class="muted hidden" id="hint"></div>
    </div>
    <div class="pill hidden" id="pill"><span>LMT</span><span class="dot" id="pill-dot" style="width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block"></span><span id="pill-count">0</span></div>
  `;

  const $ = (id) => shadow.getElementById(id);

  function mount() {
    const parent = document.body || document.documentElement;
    if (!parent) return;
    if (!host.isConnected) parent.appendChild(host);
  }

  let minimized = false;

  function applyMinimized() {
    $("card").classList.toggle("hidden", minimized);
    $("pill").classList.toggle("hidden", !minimized);
  }

  $("minimize").addEventListener("click", () => {
    minimized = true;
    applyMinimized();
    chrome.storage.local.set({ widgetMinimized: true });
  });
  $("pill").addEventListener("click", () => {
    minimized = false;
    applyMinimized();
    chrome.storage.local.set({ widgetMinimized: false });
  });

  function setStatus(kind, text, hint) {
    const el = $("status");
    el.className = `status ${kind}`;
    $("status-text").textContent = text;
    const color = kind === "ok" ? "#16a34a" : kind === "bad" ? "#ea580c" : "#94a3b8";
    $("pill-dot").style.background = color;
    const hintEl = $("hint");
    if (hint) {
      hintEl.textContent = hint;
      hintEl.classList.remove("hidden");
    } else {
      hintEl.classList.add("hidden");
    }
  }

  async function refresh() {
    let data;
    try {
      data = await chrome.storage.local.get([
        "sellerName",
        "installationId",
        "installationToken",
        "dailyCounts",
        "widgetMinimized",
      ]);
    } catch {
      setStatus("bad", "Inativo", "Falha de conexão");
      return;
    }

    minimized = Boolean(data.widgetMinimized);
    applyMinimized();

    const count = (data.dailyCounts || {})[todayKey()] || 0;
    $("count").textContent = `Hoje: ${count}`;
    $("pill-count").textContent = String(count);

    const seller = (data.sellerName || "").trim();
    const sellerEl = $("seller");
    if (seller) {
      sellerEl.textContent = `Vendedor: ${seller}`;
      sellerEl.classList.remove("hidden");
    } else {
      sellerEl.classList.add("hidden");
    }

    const configured = Boolean(
      seller && (data.installationId || "").trim() && (data.installationToken || "").trim(),
    );
    if (!configured) {
      setStatus("bad", "Inativo", "Clique na extensão para configurar");
      return;
    }

    // Confere se o service worker responde
    try {
      const pong = await chrome.runtime.sendMessage({ type: "PING" });
      if (pong?.ok) setStatus("ok", "Ativo");
      else setStatus("bad", "Inativo", "Falha de conexão");
    } catch {
      setStatus("bad", "Inativo", "Falha de conexão");
    }
  }

  try {
    chrome.storage.onChanged.addListener(() => refresh());
  } catch {
    /* ignore */
  }

  mount();
  refresh();
  console.log(`${TAG} widget flutuante ativo`);
  console.log(`${TAG} widget montado`, {
    isConnected: host.isConnected,
    position: getComputedStyle(host).position,
    right: getComputedStyle(host).right,
    bottom: getComputedStyle(host).bottom,
    zIndex: getComputedStyle(host).zIndex,
  });

  // Navegação SPA do LinkedIn pode remover o nó: reanexa sem duplicar.
  setInterval(() => {
    mount();
    refresh();
  }, 5000);
})();
