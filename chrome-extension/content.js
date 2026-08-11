// LinkedIn Message Tracker - content script
// OBSERVA apenas. Nunca clica, nunca envia mensagem, nunca automatiza nada.

(() => {
  const DEDUPE_MS = 1500;
  const MAX_ANCESTOR_LEVELS = 12;
  const TAG = "[LinkedIn Tracker]";
  const recent = new Map(); // chave do composer -> timestamp

  console.log(`${TAG} content script ativo`, location.href);

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.getAttribute("aria-disabled") === "true" || el.disabled) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 10) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
      return false;
    return true;
  }

  function looksLikeMessageBox(el) {
    const role = (el.getAttribute("role") || "").toLowerCase();
    const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("aria-placeholder") || ""} ${el.getAttribute("placeholder") || ""}`.toLowerCase();
    if (role === "textbox") return true;
    if (label.includes("mensagem") || label.includes("message") || label.includes("escreva"))
      return true;
    if (el.tagName === "TEXTAREA") return true;
    if (el.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  function isComposerCandidate(el) {
    if (!el || !(el instanceof Element)) return false;
    const editable =
      el.getAttribute("contenteditable") === "true" ||
      el.tagName === "TEXTAREA" ||
      (el.getAttribute("role") || "").toLowerCase() === "textbox";
    if (!editable) return false;
    if (el.getAttribute("contenteditable") === "false") return false;
    if (!looksLikeMessageBox(el)) return false;
    return isVisible(el);
  }

  function textOf(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA") return (el.value || "").trim();
    return (el.innerText || el.textContent || "").trim();
  }

  function collectCandidates(root) {
    const found = [];
    const nodes = root.querySelectorAll(
      '[contenteditable="true"], [role="textbox"], textarea',
    );
    for (const n of nodes) {
      if (isComposerCandidate(n)) found.push(n);
    }
    return found;
  }

  function distanceTo(el, rect) {
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - (rect.left + rect.width / 2);
    const dy = r.top + r.height / 2 - (rect.top + rect.height / 2);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pickBest(candidates, btnRect) {
    if (!candidates.length) return null;
    const withText = candidates.filter((c) => textOf(c).length > 0);
    const pool = withText.length ? withText : candidates;
    return pool
      .slice()
      .sort((a, b) => distanceTo(a, btnRect) - distanceTo(b, btnRect))[0];
  }

  // Busca progressiva por ancestrais + fallback por proximidade visual
  function findComposerForSendButton(button) {
    console.log(`${TAG} procurando composer para botão`);
    const btnRect = button.getBoundingClientRect();

    let node = button;
    let level = 0;
    while (node && level <= MAX_ANCESTOR_LEVELS) {
      console.log(`${TAG} ancestral nível ${level}`);
      const candidates = collectCandidates(node);
      console.log(`${TAG} candidatos encontrados: ${candidates.length}`);
      const best = pickBest(candidates, btnRect);
      if (best) {
        console.log(`${TAG} composer encontrado por ancestral`);
        return best;
      }
      node = node.parentElement;
      level += 1;
    }

    // Fallback: qualquer composer visível na página, mais próximo do botão
    const all = collectCandidates(document);
    console.log(`${TAG} candidatos encontrados: ${all.length}`);
    const near = pickBest(all, btnRect);
    if (near) {
      console.log(`${TAG} composer encontrado por proximidade`);
      return near;
    }

    console.log(`${TAG} nenhum composer encontrado`);
    return null;
  }

  function composerKey(composer) {
    const container =
      composer.closest('[class*="msg-"], form, [class*="messaging"]') || composer;
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

    const label = `${btn.getAttribute("aria-label") || ""} ${btn.innerText || btn.textContent || ""}`
      .trim()
      .toLowerCase();

    // Nunca contar reações, GIF, anexos, emoji etc.
    if (/(gif|anexo|attach|emoji|reaç|react|imagem|image|foto|voice|áudio|audio)/.test(label)) {
      return false;
    }

    if (/(^|\b)(enviar|send)(\b|$)/.test(label)) return btn;
    if (btn.getAttribute("type") === "submit" && btn.closest("form")) return btn;
    return false;
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

      const composer = findComposerForSendButton(btn);
      if (!composer) return;

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

      const target = event.target instanceof Element ? event.target : null;
      const composer = target ? target.closest('[contenteditable="true"], textarea, [role="textbox"]') : null;
      if (!composer || !isComposerCandidate(composer)) return;
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
