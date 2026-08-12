(() => {
  const nav = document.querySelector("#main-nav");
  if (!nav) return;

  function ensureGuideLink() {
    if (window.location.pathname.startsWith("/guia")) return;
    if (nav.querySelector('a[href="/guia"]')) return;
    if (!nav.children.length) return;
    const link = document.createElement("a");
    link.href = "/guia";
    link.textContent = "Guía y precios";
    const anchor = nav.querySelector('a[href="/login"], a.primary, button');
    if (anchor) nav.insertBefore(link, anchor);
    else nav.append(link);
  }

  const observer = new MutationObserver(() => ensureGuideLink());
  observer.observe(nav, { childList: true });
  ensureGuideLink();
})();
