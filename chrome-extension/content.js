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

      const beforeLen = textOf(composer).length;
      console.log(`${TAG} texto existente antes do envio: ${beforeLen > 0 ? "sim" : "não"}`);
      if (beforeLen === 0) return;

      watchForSendEvidence(composer, beforeLen);
    },
    true,
  );

  // Observa evidências de envio após um Enter válido (máx. 1,5s).
  function watchForSendEvidence(composer, beforeLen) {
    console.log(`${TAG} Enter aguardando confirmação`);

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
      console.log(`${TAG} ${reason}`);
      console.log(`${TAG} Enter confirmado`);
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
      console.log(`${TAG} Enter não confirmado após timeout`);
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

  function handleEnterOn(composer, event) {
    if (!event.isTrusted) return;
    if (event.key !== "Enter") return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (!isComposerCandidate(composer)) return;
    console.log(`${TAG} Enter direto detectado`);
    const beforeLen = textOf(composer).length;
    console.log(`${TAG} texto existente antes do envio: ${beforeLen > 0 ? "sim" : "não"}`);
    if (beforeLen === 0) return;
    watchForSendEvidence(composer, beforeLen);
  }

  function chatContainerOf(el) {
    return (
      el.closest(
        '[class*="msg-form"], form, [class*="msg-convo"], [class*="msg-overlay"], [class*="messaging"]',
      ) || el.parentElement
    );
  }

  function bindSendButtons(container, composer) {
    if (!container) return;
    const buttons = container.querySelectorAll('button, [role="button"]');
    for (const b of buttons) {
      if (boundButtons.has(b)) continue;
      if (!isSendButton(b)) continue;
      boundButtons.add(b);
      console.log(`${TAG} listener direto instalado no botão enviar`);
      b.addEventListener(
        "click",
        (event) => {
          if (!event.isTrusted) return;
          console.log(`${TAG} clique direto detectado`);
          const target = composer && composer.isConnected ? composer : findComposerForSendButton(b);
          if (!target) return;
          const hadText = textOf(target).length > 0;
          console.log(`${TAG} texto existente antes do envio: ${hadText ? "sim" : "não"}`);
          if (!hadText) return;
          confirmSend(target, "clique direto em Enviar");
        },
        true,
      );
    }
  }

  function registerComposer(el) {
    if (!el || boundComposers.has(el)) return;
    if (!isComposerCandidate(el)) return;
    boundComposers.add(el);
    console.log(`${TAG} chat/composer dinâmico detectado`);
    el.addEventListener("keydown", (event) => handleEnterOn(el, event), true);
    console.log(`${TAG} listener direto instalado no composer`);

    const container = chatContainerOf(el);
    bindSendButtons(container, el);
    // botões podem ser habilitados/inseridos depois que o usuário digita
    el.addEventListener("input", () => bindSendButtons(chatContainerOf(el), el), true);
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
      } catch {
        /* cross-origin: ignorado */
      }
    }
  }

  boot();
  setInterval(boot, 3000);
})();

