const hsNav = document.querySelector("#main-nav");

async function renderHomeServicesNav() {
  if (!hsNav || window.location.pathname !== "/servicios-hogar") return;

  let user = null;
  try {
    const response = await fetch("/api/v1/auth/me", { credentials: "same-origin" });
    if (response.ok) user = (await response.json()).user ?? null;
  } catch {
    user = null;
  }

  if (user) {
    hsNav.innerHTML = `
      <a href="/">Inicio</a>
      <a href="/servicios-hogar">Servicios hogar</a>
      <a class="primary" href="/panel">Panel</a>
      <button type="button" id="hs-logout">Salir</button>`;
    document.querySelector("#hs-logout")?.addEventListener("click", async () => {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
      window.location.assign("/");
    });
    return;
  }

  hsNav.innerHTML = `
    <a href="/#como-funciona">Cómo funciona</a>
    <a href="/servicios-hogar">Limpieza y jardín</a>
    <a href="/#profesionales">Profesionales</a>
    <a href="/para-profesionales">Para profesionales</a>
    <a href="/login">Entrar</a>
    <a class="primary" href="/registro-cliente">Crear cuenta</a>`;
}

void renderHomeServicesNav();
window.addEventListener("popstate", () => void renderHomeServicesNav());
