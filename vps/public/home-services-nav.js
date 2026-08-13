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
      <li class="nav-item-dropdown"><button class="dropdown-toggle" type="button">Servicios ▾</button><ul class="dropdown-menu"><li><a href="/publicar?servicio=reformas">🔨 Reformas Integrales</a></li><li><a href="/publicar?servicio=limpieza">🧹 Limpieza</a></li><li><a href="/publicar?servicio=jardineria">🌳 Jardinería</a></li></ul></li>
      <a href="/">Inicio</a>
      <a href="/guia">Guía y precios</a>
      <a href="/opiniones">Opiniones verificadas</a>
      <a href="/servicios-hogar">Servicios hogar</a>
      <a class="primary" href="/panel">Mi Cuenta</a>
      <button type="button" id="hs-logout">Salir</button>`;
    document.querySelector("#hs-logout")?.addEventListener("click", async () => {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
      window.location.assign("/");
    });
    return;
  }

  hsNav.innerHTML = `
    <li class="nav-item-dropdown"><button class="dropdown-toggle" type="button">Servicios ▾</button><ul class="dropdown-menu"><li><a href="/publicar?servicio=reformas">🔨 Reformas Integrales</a></li><li><a href="/publicar?servicio=limpieza">🧹 Limpieza</a></li><li><a href="/publicar?servicio=jardineria">🌳 Jardinería</a></li></ul></li>
    <a href="/">Inicio</a>
    <a href="/guia">Guía y precios</a>
    <a href="/opiniones">Opiniones verificadas</a>
    <a href="/para-profesionales">Para profesionales</a>
    <a href="/login">Entrar</a>
    <a class="primary" href="/publicar">Publicar proyecto</a>`;
}

void renderHomeServicesNav();
window.addEventListener("popstate", () => void renderHomeServicesNav());
