// LinkedIn Message Tracker - content script
// OBSERVA apenas. Nunca clica, nunca envia mensagem, nunca automatiza nada.

(() => {
  const DEDUPE_MS = 1500;
  const TAG = "[LinkedIn Tracker]";
  const recent = new Map(); // chave do composer -> timestamp

  console.log(`${TAG} content script ativo`, location.href);

  function isTextboxEl(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.getAttribute("contenteditable") !== "true") return false;
    const role = (el.getAttribute("role") || "").toLowerCase();
    const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("aria-placeholder") || ""}`.toLowerCase();
    if (role === "textbox") return true;
    if (label.includes("mensagem") || label.includes("message")) return true;
    // dentro de container de messaging/chat
    return Boolean(el.closest('.msg-form, .msg-form__contenteditable, [class*="msg-"], [class*="messaging"], [class*="msg-overlay"]'));
  }

  // Encontra o composer (textbox editável) a partir de um elemento qualquer
  function findComposerFrom(el) {
    if (!el || !(el instanceof Element)) return null;
    const direct = el.closest('[contenteditable="true"]');
    if (direct && isTextboxEl(direct)) return direct;
    return null;
  }

  // Container do chat/conversa ao qual um elemento pertence
  function findChatContainer(el) {
    if (!el || !(el instanceof Element)) return null;
    return (
      el.closest(
        '.msg-form, form.msg-form, .msg-form__msg-content-container, .msg-overlay-conversation-bubble, .msg-convo-wrapper, [class*="msg-overlay"], [class*="msg-form"], form',
      ) || null
    );
  }

  function composerInContainer(container) {
    if (!container) return null;
    const candidates = container.querySelectorAll('[contenteditable="true"]');
    for (const c of candidates) {
      if (isTextboxEl(c)) return c;
    }
    return null;
  }

  function textOf(composer) {
    if (!composer) return "";
    return (composer.innerText || composer.textContent || "").trim();
  }

  function composerKey(composer) {
    const container = findChatContainer(composer) || composer;
    if (!container.dataset.lmtKey) {
      container.dataset.lmtKey = Math.random().toString(36).slice(2);
    }
    return container.dataset.lmtKey;
  }

  function isSendButton(el) {
    if (!el || !(el instanceof Element)) return false;
    const btn = el.closest('button, [role="button"]');
    if (!btn) return false;
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;

    if (btn.classList.contains("msg-form__send-button")) return btn;
    if (btn.getAttribute("type") === "submit" && findChatContainer(btn)) return btn;

    const label = `${btn.getAttribute("aria-label") || ""} ${btn.innerText || btn.textContent || ""}`
      .trim()
      .toLowerCase();
    const looksLikeSend = /(^|\b)(enviar|send)(\b|$)/.test(label);
    if (!looksLikeSend) return false;
    // Precisa estar num contexto de mensagem
    return findChatContainer(btn) ? btn : false;
  }

  function confirmSend(composer, reason) {
    const key = composerKey(composer);
    const now = Date.now();
    const last = recent.get(key) || 0;
    if (now - last < DEDUPE_MS) {
      console.log(`${TAG} envio ignorado por deduplicação (${reason})`);
      return;
    }
    recent.set(key, now);
    console.log(`${TAG} envio confirmado (${reason})`);

    chrome.runtime.sendMessage(
      { type: "MESSAGE_SENT", url: location.href, eventId: crypto.randomUUID() },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`${TAG} erro ao registrar evento`, chrome.runtime.lastError.message);
          return;
        }
        if (!response?.ok) {
          console.error(`${TAG} erro ao registrar evento`, response?.error);
          return;
        }
        console.log(`${TAG} MESSAGE_SENT enviado ao background`, response.duplicate ? "(duplicado)" : "");
      },
    );
  }

  // 1) Clique no botão Enviar (somente cliques reais do usuário)
  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      const btn = isSendButton(event.target);
      if (!btn) return;
      console.log(`${TAG} clique detectado`);
      console.log(`${TAG} botão enviar identificado`);

      const container = findChatContainer(btn);
      const composer = composerInContainer(container);
      if (!composer) {
        console.log(`${TAG} composer não encontrado para este botão`);
        return;
      }
      console.log(`${TAG} composer encontrado`);
      const hadText = textOf(composer).length > 0;
      console.log(`${TAG} texto existente antes do envio: ${hadText ? "sim" : "não"}`);
      if (!hadText) return;
      confirmSend(composer, "clique em Enviar");
    },
    true,
  );

  // 2) Enter dentro do composer
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted) return;
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;

      const composer = findComposerFrom(event.target);
      if (!composer) return;
      console.log(`${TAG} Enter detectado`);
      console.log(`${TAG} composer encontrado`);

      const hadText = textOf(composer).length > 0;
      console.log(`${TAG} texto existente antes do envio: ${hadText ? "sim" : "não"}`);
      if (!hadText) return;

      // Confirma só se o composer esvaziar (indício real de envio).
      setTimeout(() => {
        if (textOf(composer).length === 0) {
          confirmSend(composer, "Enter no composer");
        } else {
          console.log(`${TAG} composer ainda com texto: envio não confirmado`);
        }
      }, 400);
    },
    true,
  );
})();
