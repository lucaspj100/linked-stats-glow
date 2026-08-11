const $ = (id) => document.getElementById(id);

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function render() {
  const { sellerName = "", linkedinAccount = "", dailyCounts = {} } =
    await chrome.storage.local.get(["sellerName", "linkedinAccount", "dailyCounts"]);

  $("seller").value = sellerName;
  $("account").value = linkedinAccount;
  $("seller-value").textContent = sellerName || "—";
  $("account-value").textContent = linkedinAccount || "—";
  $("count-value").textContent = String(dailyCounts[todayKey()] || 0);

  const configured = Boolean(sellerName && linkedinAccount);
  $("status").textContent = configured
    ? "Status: Monitoramento ativo"
    : "Status: configure vendedor e conta";
  $("status").style.color = configured ? "#2563eb" : "#b45309";
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    sellerName: $("seller").value.trim(),
    linkedinAccount: $("account").value.trim(),
  });
  $("saved").textContent = "Configuração salva.";
  setTimeout(() => ($("saved").textContent = ""), 2000);
  render();
});

chrome.storage.onChanged.addListener(render);
render();
