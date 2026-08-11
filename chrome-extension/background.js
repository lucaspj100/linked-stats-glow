// LinkedIn Message Tracker - service worker (MV3)
// Recebe eventos do content script e envia para o endpoint seguro do painel.
// NUNCA usa service_role nem grava direto no banco: apenas installation_id + installation_token.

const ENDPOINT = "https://project--275e3dec-0801-4821-952e-33dbf781aafe.lovable.app/api/public/track-message";

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function bumpLocalCounter() {
  const key = todayKey();
  const { dailyCounts = {} } = await chrome.storage.local.get("dailyCounts");
  const next = { [key]: (dailyCounts[key] || 0) + 1 };
  await chrome.storage.local.set({ dailyCounts: next, lastEventAt: new Date().toISOString() });
}

async function recordEvent({ url, eventId }) {
  const {
    sellerName = "",
    installationId = "",
    installationToken = "",
  } = await chrome.storage.local.get(["sellerName", "installationId", "installationToken"]);

  if (!sellerName.trim()) {
    console.warn("[LinkedIn Tracker] vendedor não configurado no popup");
    return { ok: false, error: "not_configured" };
  }
  if (!installationId.trim() || !installationToken.trim()) {
    console.warn("[LinkedIn Tracker] installation_id/installation_token não configurados no popup");
    return { ok: false, error: "not_registered" };
  }

  const payload = {
    installation_id: installationId.trim(),
    installation_token: installationToken.trim(),
    // event_id gerado na extensão: o backend tem índice UNIQUE e ignora duplicados.
    event_id: eventId || crypto.randomUUID(),
    person_name: sellerName.trim(),
    // Contagem é por vendedor: não distinguimos perfis do LinkedIn.
    linkedin_account: "Geral",
    sent_at: new Date().toISOString(),
    url: (url || "").slice(0, 2000),
  };


  console.log("[LinkedIn Tracker] enviando evento", { ...payload, installation_token: "***" });

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[LinkedIn Tracker] erro ao registrar evento", res.status, body);
      return { ok: false, error: body.error || String(res.status) };
    }

    if (body.duplicate) {
      console.log("[LinkedIn Tracker] evento duplicado ignorado pelo backend", payload.event_id);
      return { ok: true, duplicate: true };
    }

    await bumpLocalCounter();
    console.log("[LinkedIn Tracker] evento registrado", payload.event_id);
    return { ok: true };
  } catch (err) {
    console.error("[LinkedIn Tracker] erro de rede ao registrar evento", err);
    return { ok: false, error: String(err) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true, at: Date.now() });
    return false;
  }
  if (message?.type === "MESSAGE_SENT") {
    recordEvent(message).then(sendResponse);
    return true; // resposta assíncrona
  }
  if (message?.type === "TEST_EVENT") {
    recordEvent({ url: "https://www.linkedin.com/messaging/", eventId: crypto.randomUUID() }).then(
      sendResponse,
    );
    return true;
  }
  return false;
});
