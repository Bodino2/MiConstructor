(() => {
  const nav = document.querySelector("#main-nav");
  if (!nav) return;

  function ensurePublicContentLinks() {
    if (window.location.pathname.startsWith("/guia") || window.location.pathname === "/opiniones") return;
    if (nav.classList.contains("navbar-marketplace")) return;
    if (!nav.children.length) return;
    const anchor = nav.querySelector('a[href="/login"], a.primary, button');
    const insert = (href, label) => {
      if (nav.querySelector(`a[href="${href}"]`)) return;
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label;
      if (anchor) nav.insertBefore(link, anchor);
      else nav.append(link);
    };
    if (window.location.pathname === "/") {
      insert("/#como-funciona", "Cómo funciona");
      insert("/servicios-hogar", "Limpieza y jardín");
      insert("/#profesionales", "Profesionales");
      insert("/para-profesionales", "Para profesionales");
    }

    insert("/guia", "Guía y precios");
    insert("/opiniones", "Opiniones verificadas");
  }

  const observer = new MutationObserver(() => ensurePublicContentLinks());
  observer.observe(nav, { childList: true });
  ensurePublicContentLinks();
})();