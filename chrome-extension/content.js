// LinkedIn Message Tracker - content script
// OBSERVA apenas. Nunca clica, nunca envia mensagem, nunca automatiza nada.

(() => {
  const DEDUPE_MS = 1500;
  const MAX_ANCESTOR_LEVELS = 12;
  const TAG = "[LinkedIn Tracker]";
  const recent = new Map(); // chave do composer -> timestamp
  const processedEvents = new WeakSet(); // evita processar o mesmo Event 2x
  let lastFocusedComposer = null;

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

  // ----------------------------------------------------------------
  // composedPath helpers (shadow DOM aberto, web components, filhos)
  // ----------------------------------------------------------------

  function pathOf(event) {
    try {
      return typeof event.composedPath === "function" ? event.composedPath() : [];
    } catch {
      return [];
    }
  }

  function editableFromPath(path) {
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (isComposerCandidate(node)) return node;
    }
    // segundo passe: elemento editável ainda que sem "cara" de mensagem
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (
        node.getAttribute?.("contenteditable") === "true" ||
        node.tagName === "TEXTAREA" ||
        (node.getAttribute?.("role") || "").toLowerCase() === "textbox"
      ) {
        if (isVisible(node)) return node;
      }
    }
    return null;
  }

  function getComposerFromEvent(event) {
    const path = pathOf(event);
    let found = editableFromPath(path);
    if (found) return found;
    const target = event.target instanceof Element ? event.target : null;
    if (target) {
      const closest = target.closest?.('[contenteditable="true"], textarea, [role="textbox"]');
      if (closest && isVisible(closest)) return closest;
    }
    return null;
  }

  function collectCandidates(root) {
    const found = [];
    let nodes;
    try {
      nodes = root.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
    } catch {
      return found;
    }
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
    const btnRect = button.getBoundingClientRect();

    let node = button;
    let level = 0;
    while (node && level <= MAX_ANCESTOR_LEVELS) {
      const candidates = collectCandidates(node);
      const best = pickBest(candidates, btnRect);
      if (best) return best;
      node = node.parentElement;
      level += 1;
    }

    // Fallback: qualquer composer visível na página, mais próximo do botão
    const all = collectCandidates(document);
    const near = pickBest(all, btnRect);
    if (near) return near;

    return null;
  }

  function resolveComposerForButton(button, event) {
    const fromPath = event ? getComposerFromEvent(event) : null;
    if (fromPath && textOf(fromPath).length > 0) return fromPath;

    if (
      lastFocusedComposer &&
      lastFocusedComposer.isConnected &&
      isVisible(lastFocusedComposer) &&
      textOf(lastFocusedComposer).length > 0
    ) {
      return lastFocusedComposer;
    }

    const active = document.activeElement;
    if (active && isComposerCandidate(active) && textOf(active).length > 0) {
      return active;
    }

    return findComposerForSendButton(button) || fromPath;
  }

  function composerKey(composer) {
    const container =
      composer.closest('[class*="msg-"], form, [class*="messaging"]') || composer;
    if (!container.dataset.lmtKey) {
      container.dataset.lmtKey = Math.random().toString(36).slice(2);
    }
    return container.dataset.lmtKey;
  }

  function isSendButtonEl(btn) {
    if (!btn || !(btn instanceof Element)) return false;
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;
    if (btn.classList.contains("msg-form__send-button")) return true;

    const label = `${btn.getAttribute("aria-label") || ""} ${btn.innerText || btn.textContent || ""}`
      .trim()
      .toLowerCase();

    // Nunca contar reações, GIF, anexos, emoji etc.
    if (/(gif|anexo|attach|emoji|reaç|react|imagem|image|foto|voice|áudio|audio)/.test(label)) {
      return false;
    }

    if (/(^|\b)(enviar|send)(\b|$)/.test(label)) return true;
    if (btn.getAttribute("type") === "submit" && btn.closest("form")) return true;
    return false;
  }

  function isSendButton(el) {
    if (!el || !(el instanceof Element)) return false;
    const btn = el.closest('button, [role="button"]');
    if (!btn) return false;
    return isSendButtonEl(btn) ? btn : false;
  }

  function sendButtonFromEvent(event) {
    const path = pathOf(event);
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      const role = (node.getAttribute?.("role") || "").toLowerCase();
      if (node.tagName !== "BUTTON" && role !== "button") continue;
      if (isSendButtonEl(node)) return node;
      return false;
    }
    return isSendButton(event.target);
  }

  function confirmSend(composer, reason) {
    const key = composerKey(composer);
    const now = Date.now();
    const last = recent.get(key) || 0;
    if (now - last < DEDUPE_MS) {
      return;
    }
    recent.set(key, now);

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
      },
    );
  }

  // ----------------------------------------------------------------
  // Handlers unificados (usados por window, document e listeners diretos)
  // ----------------------------------------------------------------

  function handleClickEvent(event, origin) {
    if (!event.isTrusted) return;
    if (processedEvents.has(event)) return;
    processedEvents.add(event);

    const btn = sendButtonFromEvent(event);
    if (!btn) return;

    const composer = resolveComposerForButton(btn, event);
    if (!composer) return;

    const hadText = textOf(composer).length > 0;
    if (!hadText) return;
    confirmSend(composer, "clique em Enviar");
  }

  function handleKeydownEvent(event, origin) {
    if (!event.isTrusted) return;
    if (event.key !== "Enter") return;
    if (processedEvents.has(event)) return;
    processedEvents.add(event);

    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;

    let composer = getComposerFromEvent(event);
    if (!composer && lastFocusedComposer && lastFocusedComposer.isConnected) {
      composer = lastFocusedComposer;
    }
    if (!composer) return;

    const beforeLen = textOf(composer).length;
    if (beforeLen === 0) return;

    watchForSendEvidence(composer, beforeLen);
  }

  // Listeners globais na fase mais alta possível
  window.addEventListener("click", (e) => handleClickEvent(e, "window"), true);
  window.addEventListener("keydown", (e) => handleKeydownEvent(e, "window"), true);
  document.addEventListener("click", (e) => handleClickEvent(e, "document"), true);
  document.addEventListener("keydown", (e) => handleKeydownEvent(e, "document"), true);

  // ----------------------------------------------------------------
  // focusin como fonte principal de detecção do editor real
  // ----------------------------------------------------------------

  function trackFocus(event) {
    const path = pathOf(event);
    const editor = editableFromPath(path) || (event.target instanceof Element ? event.target.closest?.('[contenteditable="true"], textarea, [role="textbox"]') : null);
    if (!editor) return;
    if (!isComposerCandidate(editor)) return;
    lastFocusedComposer = editor;
    registerComposer(editor);
  }

  window.addEventListener("focusin", trackFocus, true);
  document.addEventListener("focusin", trackFocus, true);

  // Observa evidências de envio após um Enter válido (máx. 1,5s).
  function watchForSendEvidence(composer, beforeLen) {
    const convo =
      composer.closest(
        '[class*="msg-form"], form, [class*="msg-convo"], [class*="msg-overlay"], [class*="messaging"]',
      ) || composer.parentElement || document.body;

    const initialChildren = convo.querySelectorAll("li, [class*='msg-s-event']").length;
    let done = false;

    const finish = (reason) => {
      if (done) return;
      done = true;
      cleanup();
      confirmSend(composer, "Enter no composer");
    };

    const check = () => {
      if (done) return;
      const detached = !composer.isConnected || composer.getAttribute("contenteditable") === "false";
      if (textOf(composer).length === 0 || detached) {
        finish("confirmação por campo vazio");
        return;
      }
      const now = convo.querySelectorAll("li, [class*='msg-s-event']").length;
      if (now > initialChildren) {
        finish("confirmação por mudança estrutural");
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(convo, { childList: true, subtree: true, characterData: true });
    const interval = setInterval(check, 150);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
    }, 1500);

    function cleanup() {
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timer);
    }
  }

  // ----------------------------------------------------------------
  // Captura dinâmica (chat flutuante, overlays, shadow roots, iframes)
  // ----------------------------------------------------------------

  const boundComposers = new WeakSet();
  const boundButtons = new WeakSet();
  const observedRoots = new WeakSet();

  function chatContainerOf(el) {
    return (
      el.closest(
        '[class*="msg-form"], form, [class*="msg-convo"], [class*="msg-overlay"], [class*="messaging"]',
      ) || el.parentElement
    );
  }

  function bindSendButtons(container) {
    if (!container) return;
    let buttons;
    try {
      buttons = container.querySelectorAll('button, [role="button"]');
    } catch {
      return;
    }
    for (const b of buttons) {
      if (boundButtons.has(b)) continue;
      if (!isSendButtonEl(b)) continue;
      boundButtons.add(b);
      b.addEventListener("click", (event) => {
        handleClickEvent(event, "botão");
      }, true);
    }
  }

  function registerComposer(el) {
    if (!el || boundComposers.has(el)) return;
    if (!isComposerCandidate(el)) return;
    boundComposers.add(el);
    el.addEventListener("keydown", (event) => {
      handleKeydownEvent(event, "composer");
    }, true);

    bindSendButtons(chatContainerOf(el));
    el.addEventListener("input", () => bindSendButtons(chatContainerOf(el)), true);
  }

  function scanRoot(root) {
    if (!root || !root.querySelectorAll) return;
    let nodes;
    try {
      nodes = root.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
    } catch {
      return;
    }
    for (const n of nodes) registerComposer(n);

    // shadow roots abertos
    let all;
    try {
      all = root.querySelectorAll("*");
    } catch {
      return;
    }
    for (const el of all) {
      if (el.shadowRoot) {
        observeRoot(el.shadowRoot);
        scanRoot(el.shadowRoot);
        el.shadowRoot.addEventListener("keydown", (e) => handleKeydownEvent(e, "shadow"), true);
        el.shadowRoot.addEventListener("click", (e) => handleClickEvent(e, "shadow"), true);
        el.shadowRoot.addEventListener("focusin", trackFocus, true);
      }
    }
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          registerComposer(node);
          scanRoot(node);
        }
      }
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  function boot() {
    observeRoot(document.body || document.documentElement);
    scanRoot(document);
    // iframes same-origin (chat flutuante em alguns layouts)
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        const doc = frame.contentDocument;
        if (!doc) continue;
        observeRoot(doc.body || doc.documentElement);
        scanRoot(doc);
        doc.addEventListener("keydown", (e) => handleKeydownEvent(e, "iframe"), true);
        doc.addEventListener("click", (e) => handleClickEvent(e, "iframe"), true);
        doc.addEventListener("focusin", trackFocus, true);
      } catch {
        /* cross-origin: ignorado */
      }
    }
  }

  boot();
  setInterval(boot, 3000);
})();
