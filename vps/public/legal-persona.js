(() => {
  let config = null;

  async function getConfig() {
    if (config) return config;
    config = await fetch("/api/v1/config", { credentials: "same-origin" }).then((response) => response.json()).catch(() => null);
    return config;
  }

  async function normalizeLegalIdentity() {
    if (!["/aviso-legal", "/privacidad"].includes(location.pathname)) return;
    const runtime = await getConfig();
    if (!runtime || runtime.legalEntityType !== "persona_fisica") return;
    const shell = document.querySelector("#app .legal-shell");
    if (!shell) return;

    shell.querySelectorAll("li").forEach((item) => {
      const text = item.textContent || "";
      if (text.trim().startsWith("NIF/VAT:")) {
        const strong = item.querySelector("strong");
        if (strong) strong.textContent = "NIF/NIE:";
      }
      if (text.trim().startsWith("Registro:")) item.remove();
    });
  }

  const observer = new MutationObserver(() => void normalizeLegalIdentity());
  const start = () => {
    observer.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
    void normalizeLegalIdentity();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
