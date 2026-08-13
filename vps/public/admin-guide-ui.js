(() => {
  const app = document.querySelector("#app");
  if (!app) return;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  })[character]);

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set("content-type", "application/json");
    const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "No se ha podido completar la operación.");
    return payload;
  }

  const slugify = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
  const blank = () => ({
    id: "", slug: "", category: "Consejos", title: "", summary: "", body: "", priceRange: "", priceMetric: "",
    highlights: [], caveats: "", sourceLabel: "", sourceUrl: "", sourceDateLabel: "", authorName: "Equipo MiConstructor",
    coverImagePath: "", seoTitle: "", seoDescription: "", status: "BORRADOR",
  });

  let articles = [];
  let selected = null;

  function articleCard(article) {
    return `<article class="admin-guide-item">
      <span class="eyebrow">${escapeHtml(article.category)} · ${escapeHtml(article.status)}</span>
      <h4>${escapeHtml(article.title)}</h4>
      <p>/guia/${escapeHtml(article.slug)}</p>
      <div class="actions"><button class="button" data-guide-edit="${article.id}">Editar</button>${article.status === "PUBLICADO" ? `<a class="button" href="/guia/${escapeHtml(article.slug)}" target="_blank" rel="noopener">Ver público</a>` : ""}</div>
    </article>`;
  }

  function editor(article) {
    const highlights = Array.isArray(article.highlights) ? article.highlights.join("\n") : "";
    return `<form id="admin-guide-form" class="card admin-guide-editor">
      <input type="hidden" name="id" value="${escapeHtml(article.id || "")}" />
      <header><span class="eyebrow">CMS · GUÍA MICONSTRUCTOR</span><h3>${article.id ? "Editar artículo" : "Nuevo artículo"}</h3><p class="muted">Los artículos PUBLICADO aparecen inmediatamente en /guia y sitemap.xml.</p></header>
      <div class="form-grid">
        <label>Título<input name="title" required minlength="8" maxlength="180" value="${escapeHtml(article.title)}" /></label>
        <label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="120" value="${escapeHtml(article.slug)}" /><small>URL: /guia/slug</small></label>
        <label>Categoría<input name="category" required maxlength="80" value="${escapeHtml(article.category)}" /></label>
        <label>Estado<select name="status"><option value="BORRADOR"${article.status === "BORRADOR" ? " selected" : ""}>Borrador</option><option value="PUBLICADO"${article.status === "PUBLICADO" ? " selected" : ""}>Publicado</option></select></label>
        <label class="full">Resumen<textarea name="summary" required minlength="20" maxlength="600">${escapeHtml(article.summary)}</textarea></label>
        <label class="full">Contenido<textarea name="body" required minlength="40" maxlength="12000">${escapeHtml(article.body)}</textarea><small>Separa párrafos con una línea en blanco.</small></label>
        <label>Rango de precio<input name="priceRange" maxlength="120" value="${escapeHtml(article.priceRange || "")}" placeholder="Ej. 3.250 € – 3.750 €" /></label>
        <label>Métrica<input name="priceMetric" maxlength="160" value="${escapeHtml(article.priceMetric || "")}" placeholder="Ej. 650–750 €/m²" /></label>
        <label class="full">Puntos clave<textarea name="highlights" maxlength="5000">${escapeHtml(highlights)}</textarea><small>Un punto por línea.</small></label>
        <label class="full">Qué puede cambiar el precio<textarea name="caveats" maxlength="2500">${escapeHtml(article.caveats || "")}</textarea></label>
        <label>Fuente<input name="sourceLabel" maxlength="240" value="${escapeHtml(article.sourceLabel || "")}" /></label>
        <label>URL fuente<input name="sourceUrl" type="url" value="${escapeHtml(article.sourceUrl || "")}" placeholder="https://..." /></label>
        <label>Fecha sursei<input name="sourceDateLabel" maxlength="120" value="${escapeHtml(article.sourceDateLabel || "")}" /></label>
        <label>Autor<input name="authorName" required maxlength="120" value="${escapeHtml(article.authorName || "Equipo MiConstructor")}" /></label>
        <label class="full">Imagine copertă / asset path<input name="coverImagePath" value="${escapeHtml(article.coverImagePath || "")}" placeholder="/miconstructor-platform.webp" /><small>Trebuie să fie un asset public din MiConstructor.</small></label>
        <div class="full admin-guide-seo"><span class="eyebrow">SEO</span></div>
        <label class="full">SEO title<input name="seoTitle" required minlength="10" maxlength="180" value="${escapeHtml(article.seoTitle || "")}" /></label>
        <label class="full">Meta description<textarea name="seoDescription" required minlength="30" maxlength="320">${escapeHtml(article.seoDescription || "")}</textarea></label>
        <div class="form-actions full admin-guide-preview"><button class="button primary">Guardar artículo</button>${article.id && article.status === "BORRADOR" ? `<button type="button" class="button danger-button admin-guide-danger" data-guide-delete="${article.id}">Eliminar borrador</button>` : ""}</div>
      </div>
    </form>`;
  }

  function render() {
    const target = document.querySelector("#admin-content");
    if (!target) return;
    target.innerHTML = `<div class="admin-guide-toolbar"><div><h3>Guía MiConstructor</h3><p class="muted">Artículos, estudios de caso y SEO.</p></div><button class="button primary" id="guide-new">Nuevo artículo +</button></div>
      <div class="admin-guide-layout"><div class="admin-guide-list">${articles.length ? articles.map(articleCard).join("") : '<div class="empty">No hay artículos.</div>'}</div><div>${editor(selected || blank())}</div></div>`;

    document.querySelector("#guide-new")?.addEventListener("click", () => { selected = blank(); render(); });
    document.querySelectorAll("[data-guide-edit]").forEach((button) => button.addEventListener("click", () => {
      selected = articles.find((article) => article.id === button.dataset.guideEdit) || blank();
      render();
    }));
    const form = document.querySelector("#admin-guide-form");
    const title = form?.elements.title;
    const slug = form?.elements.slug;
    title?.addEventListener("input", () => { if (!form.dataset.slugTouched && !selected?.id) slug.value = slugify(title.value); });
    slug?.addEventListener("input", () => { form.dataset.slugTouched = "true"; slug.value = slugify(slug.value); });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const payload = {
        slug: data.slug, category: data.category, title: data.title, summary: data.summary, body: data.body,
        priceRange: data.priceRange || null, priceMetric: data.priceMetric || null,
        highlights: String(data.highlights || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        caveats: data.caveats || null, sourceLabel: data.sourceLabel || null, sourceUrl: data.sourceUrl || null,
        sourceDateLabel: data.sourceDateLabel || null, authorName: data.authorName,
        coverImagePath: data.coverImagePath || null, seoTitle: data.seoTitle, seoDescription: data.seoDescription, status: data.status,
      };
      try {
        if (data.id) await api(`/api/v1/admin/guide/articles/${data.id}`, { method: "PUT", body: JSON.stringify(payload) });
        else await api("/api/v1/admin/guide/articles", { method: "POST", body: JSON.stringify(payload) });
        await load();
      } catch (error) { window.alert(error.message); }
    });
    document.querySelector("[data-guide-delete]")?.addEventListener("click", async (event) => {
      if (!window.confirm("¿Eliminar este borrador?")) return;
      try { await api(`/api/v1/admin/guide/articles/${event.currentTarget.dataset.guideDelete}`, { method: "DELETE" }); selected = null; await load(); }
      catch (error) { window.alert(error.message); }
    });
  }

  async function load() {
    const result = await api("/api/v1/admin/guide/articles");
    articles = result.articles || [];
    if (selected?.id) selected = articles.find((article) => article.id === selected.id) || null;
    render();
  }

  function activateGuideTab() {
    document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.remove("active"));
    document.querySelector("[data-admin-guide-tab]")?.classList.add("active");
    void load().catch((error) => window.alert(error.message));
  }

  function enhance() {
    if (location.pathname !== "/panel") return;
    const tabs = document.querySelector(".admin-tabs");
    if (!tabs || tabs.querySelector("[data-admin-guide-tab]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.adminGuideTab = "true";
    button.textContent = "Guía / Blog";
    tabs.append(button);
    button.addEventListener("click", activateGuideTab);
  }

  new MutationObserver(enhance).observe(app, { childList: true, subtree: true });
  enhance();
})();