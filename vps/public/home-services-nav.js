async function renderHomeServicesNav() {
  if (window.location.pathname !== "/servicios-hogar") return;
  if (window.MiConstructorShell) return window.MiConstructorShell.refreshHeader();
  await new Promise((resolve) => {
    window.addEventListener(
      "miconstructor:shell-ready",
      (event) => resolve(event.detail.refreshHeader()),
      { once: true },
    );
  });
}

void renderHomeServicesNav();
window.addEventListener("popstate", () => void renderHomeServicesNav());