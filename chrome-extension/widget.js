// LinkedIn Message Tracker - widget flutuante discreto no LinkedIn
// Não captura mensagens. Apenas exibe status e contador para o vendedor.

(function () {
  const WIDGET_ID = "linkedin-message-tracker-widget";
  if (document.getElementById(WIDGET_ID)) return;

  const host = document.createElement("div");
  host.id = WIDGET_ID;
  host.style.cssText =
    "all:initial;position:fixed;right:16px;bottom:120px;z-index:2147483000;width:auto;";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .lmt-card {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      padding: 12px 14px;
      min-width: 170px;
      color: #111827;
      font-size: 13px;
      line-height: 1.35;
      transition: opacity .2s ease, transform .2s ease;
      cursor: default;
      user-select: none;
    }
    .lmt-card.minimized {
      min-width: auto;
      padding: 8px 12px;
      border-radius: 999px;
    }
    .lmt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
    }
    .lmt-title {
      font-weight: 600;
      font-size: 12px;
      color: #374151;
    }
    .lmt-toggle {
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
      color: #6b7280;
      font-size: 12px;
      line-height: 1;
    }
    .lmt-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .lmt-body.hidden { display: none; }
    .lmt-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    .lmt-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .lmt-dot.active { background: #22c55e; }
    .lmt-dot.inactive { background: #ef4444; }
    .lmt-dot.checking { background: #f59e0b; }
    .lmt-count {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
    }
    .lmt-label {
      font-size: 11px;
      color: #6b7280;
    }
    .lmt-seller {
      font-size: 11px;
      color: #374151;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    .lmt-hint {
      font-size: 10px;
      color: #9ca3af;
      margin-top: 4px;
    }
  `;

  const card = document.createElement("div");
  card.className = "lmt-card";

  const header = document.createElement("div");
  header.className = "lmt-header";
  const title = document.createElement("span");
  title.className = "lmt-title";
  title.textContent = "LMT";
  const toggle = document.createElement("button");
  toggle.className = "lmt-toggle";
  toggle.setAttribute("aria-label", "Minimizar ou expandir");
  toggle.textContent = "−";
  header.appendChild(title);
  header.appendChild(toggle);

  const body = document.createElement("div");
  body.className = "lmt-body";

  const status = document.createElement("div");
  status.className = "lmt-status";
  const dot = document.createElement("span");
  dot.className = "lmt-dot checking";
  const statusText = document.createElement("span");
  statusText.textContent = "Verificando...";
  status.appendChild(dot);
  status.appendChild(statusText);

  const count = document.createElement("div");
  count.className = "lmt-count";
  count.textContent = "0";

  const label = document.createElement("div");
  label.className = "lmt-label";
  label.textContent = "mensagens hoje";

  const seller = document.createElement("div");
  seller.className = "lmt-seller";
  seller.textContent = "";

  const hint = document.createElement("div");
  hint.className = "lmt-hint";
  hint.textContent = "Clique na extensão para configurar";

  body.appendChild(status);
  body.appendChild(count);
  body.appendChild(label);
  body.appendChild(seller);
  body.appendChild(hint);

  card.appendChild(header);
  card.appendChild(body);
  shadow.appendChild(style);
  shadow.appendChild(card);

  let minimized = false;
  chrome.storage.local.get("lmtWidgetMinimized").then(({ lmtWidgetMinimized }) => {
    minimized = !!lmtWidgetMinimized;
    applyMinimized();
  });

  function applyMinimized() {
    if (minimized) {
      card.classList.add("minimized");
      body.classList.add("hidden");
      title.textContent = `LMT ${count.textContent}`;
      toggle.textContent = "+";
    } else {
      card.classList.remove("minimized");
      body.classList.remove("hidden");
      title.textContent = "LMT";
      toggle.textContent = "−";
    }
  }

  toggle.addEventListener("click", () => {
    minimized = !minimized;
    chrome.storage.local.set({ lmtWidgetMinimized: minimized });
    applyMinimized();
  });

  function updateFromStorage(changes) {
    if (changes.dailyCounts) {
      const today = new Date();
      const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const counts = changes.dailyCounts.newValue || {};
      count.textContent = String(counts[key] || 0);
      if (minimized) title.textContent = `LMT ${count.textContent}`;
    }
    if (changes.sellerName) {
      seller.textContent = changes.sellerName.newValue || "";
    }
    if (changes.installationId || changes.installationToken) {
      checkStatus();
    }
  }

  async function checkStatus() {
    const { sellerName = "", installationId = "", installationToken = "" } = await chrome.storage.local.get([
      "sellerName",
      "installationId",
      "installationToken",
    ]);

    seller.textContent = sellerName || "";

    if (!sellerName.trim() || !installationId.trim() || !installationToken.trim()) {
      dot.className = "lmt-dot inactive";
      statusText.textContent = "Inativo";
      hint.textContent = "Clique na extensão para configurar";
      return;
    }

    try {
      const res = await chrome.runtime.sendMessage({ type: "PING" });
      if (res?.ok) {
        dot.className = "lmt-dot active";
        statusText.textContent = "Ativo";
        hint.textContent = "Monitorando envios manuais";
      } else {
        throw new Error("ping failed");
      }
    } catch (err) {
      dot.className = "lmt-dot inactive";
      statusText.textContent = "Falha de conexão";
      hint.textContent = "Tente recarregar a extensão";
    }
  }

  document.body.appendChild(host);

  chrome.storage.local.get(["dailyCounts", "sellerName"]).then(({ dailyCounts = {}, sellerName = "" }) => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    count.textContent = String(dailyCounts[key] || 0);
    seller.textContent = sellerName || "";
    if (minimized) title.textContent = `LMT ${count.textContent}`;
  });

  chrome.storage.onChanged.addListener(updateFromStorage);
  checkStatus();
})();
