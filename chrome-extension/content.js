// LinkedIn Message Tracker - content script
// OBSERVA apenas. Nunca clica, nunca envia mensagem, nunca automatiza nada.

(() => {
  const DEDUPE_MS = 1500;
  let lastRecordedAt = 0;

  console.log("[LinkedIn Tracker] extensão carregada");

  function isComposerBox(el) {
    if (!el || !(el instanceof Element)) return false;
    return Boolean(
      el.closest(
        '.msg-form__contenteditable, [aria-label*="Escreva uma mensagem" i], [aria-label*="Write a message" i], [contenteditable="true"][role="textbox"]',
      ),
    );
  }

  function isSendButton(el) {
    if (!el || !(el instanceof Element)) return false;
    const btn = el.closest('button, [role="button"]');
    if (!btn) return false;
    if (btn.disabled) return false;

    if (btn.classList.contains("msg-form__send-button")) return true;

    const label = `${btn.getAttribute("aria-label") || ""} ${btn.textContent || ""}`
      .trim()
      .toLowerCase();
    if (!/^(enviar|send)\b/.test(label) && !/\b(enviar|send)$/.test(label)) return false;

    // precisa estar dentro de um composer de mensagem
    return Boolean(btn.closest("form, .msg-form, .msg-form__msg-content-container"));
  }

  function composerHasText() {
    const box = document.querySelector(
      '.msg-form__contenteditable, [contenteditable="true"][role="textbox"]',
    );
    return Boolean(box && (box.innerText || "").trim().length > 0);
  }

  function confirmSend(reason) {
    const now = Date.now();
    if (now - lastRecordedAt < DEDUPE_MS) {
      console.log("[LinkedIn Tracker] possível envio detectado (ignorado por deduplicação)", reason);
      return;
    }
    lastRecordedAt = now;
    console.log("[LinkedIn Tracker] evento confirmado", reason);

    chrome.runtime.sendMessage(
      { type: "MESSAGE_SENT", url: location.href },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[LinkedIn Tracker] erro ao registrar evento", chrome.runtime.lastError.message);
          return;
        }
        if (!response?.ok) {
          console.error("[LinkedIn Tracker] erro ao registrar evento", response?.error);
        }
      },
    );
  }

  // 1) Clique manual no botão Enviar (somente cliques reais do usuário)
  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      if (!isSendButton(event.target)) return;
      console.log("[LinkedIn Tracker] possível envio detectado (clique em Enviar)");
      if (!composerHasText()) return;
      confirmSend("clique em Enviar");
    },
    true,
  );

  // 2) Enter no composer (ignora Shift+Enter / quebra de linha e IME)
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted) return;
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.altKey || event.isComposing) return;
      if (!isComposerBox(event.target)) return;
      console.log("[LinkedIn Tracker] possível envio detectado (Enter no composer)");

      const hadText = composerHasText();
      if (!hadText) return;

      // Confirma só se o composer esvaziar logo depois (indício real de envio).
      setTimeout(() => {
        if (!composerHasText()) confirmSend("Enter no composer");
      }, 400);
    },
    true,
  );

  // 3) SPA: o LinkedIn troca o DOM sem recarregar. Mantemos apenas um log leve,
  // sem contar nada a partir de mutações (evita falsos positivos).
  const observer = new MutationObserver(() => {});
  observer.observe(document.documentElement, { childList: true, subtree: false });
})();
