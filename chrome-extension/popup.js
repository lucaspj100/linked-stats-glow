const $ = (id) => document.getElementById(id);

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function render() {
  const {
    sellerName = "",
    installationId = "",
    installationToken = "",
    dailyCounts = {},
  } = await chrome.storage.local.get([
    "sellerName",
    "installationId",
    "installationToken",
    "dailyCounts",
  ]);

  $("seller").value = sellerName;
  $("installation-id").value = installationId;
  $("installation-token").value = installationToken;
  $("seller-value").textContent = sellerName || "—";
  $("install-value").textContent = installationId
    ? `${installationId.slice(0, 8)}… ${installationToken ? "(token salvo)" : "(sem token)"}`
    : "—";
  $("count-value").textContent = String(dailyCounts[todayKey()] || 0);

  const configured = Boolean(sellerName && installationId && installationToken);
  $("status").textContent = configured
    ? "Status: Monitoramento ativo"
    : "Status: configure vendedor e credenciais da instalação";
  $("status").style.color = configured ? "#2563eb" : "#b45309";
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    sellerName: $("seller").value.trim(),
    installationId: $("installation-id").value.trim(),
    installationToken: $("installation-token").value.trim(),
  });
  $("saved").textContent = "Configuração salva.";
  setTimeout(() => ($("saved").textContent = ""), 2000);
  render();
});

$("test").addEventListener("click", () => {
  $("saved").textContent = "Enviando evento de teste…";
  chrome.runtime.sendMessage({ type: "TEST_EVENT" }, (response) => {
    $("saved").textContent = response?.ok
      ? response.duplicate
        ? "Duplicado ignorado pelo backend."
        : "Evento de teste registrado."
      : `Falhou: ${response?.error || "erro desconhecido"}`;
    render();
  });
});

chrome.storage.onChanged.addListener(render);
render();
