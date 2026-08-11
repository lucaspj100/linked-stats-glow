// LinkedIn Message Tracker - service worker (MV3)
// Recebe eventos do content script e faz o INSERT no backend.
// Somente a chave PÚBLICA (publishable/anon) é usada aqui. Nunca service_role.

const SUPABASE_URL = "https://duljnccbjhgptnbysaje.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3ygMj1ktw4NvE8GeGyayQA_ld3dIoBh";
const TABLE = "message_events";

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

async function recordEvent({ url }) {
  const { sellerName = "", linkedinAccount = "" } = await chrome.storage.local.get([
    "sellerName",
    "linkedinAccount",
  ]);

  if (!sellerName.trim() || !linkedinAccount.trim()) {
    console.warn("[LinkedIn Tracker] erro ao registrar evento: vendedor/conta não configurados no popup");
    return { ok: false, error: "not_configured" };
  }

  const payload = {
    person_name: sellerName.trim(),
    linkedin_account: linkedinAccount.trim(),
    sent_at: new Date().toISOString(),
    url: (url || "").slice(0, 2000),
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        // Chaves sb_publishable_ são opacas (não são JWT): enviar apenas apikey.
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[LinkedIn Tracker] erro ao registrar evento", res.status, text);
      return { ok: false, error: text };
    }

    await bumpLocalCounter();
    console.log("[LinkedIn Tracker] evento enviado ao Supabase", payload);
    return { ok: true };
  } catch (err) {
    console.error("[LinkedIn Tracker] erro ao registrar evento", err);
    return { ok: false, error: String(err) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MESSAGE_SENT") {
    recordEvent(message).then(sendResponse);
    return true; // resposta assíncrona
  }
  return false;
});
