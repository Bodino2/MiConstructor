import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(120);
const articleSchema = z.object({
  slug: slugSchema,
  category: z.string().trim().min(2).max(80),
  title: z.string().trim().min(8).max(180),
  summary: z.string().trim().min(20).max(600),
  body: z.string().trim().min(40).max(12000),
  priceRange: z.string().trim().max(120).optional().nullable(),
  priceMetric: z.string().trim().max(160).optional().nullable(),
  highlights: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  caveats: z.string().trim().max(2500).optional().nullable(),
  sourceLabel: z.string().trim().max(240).optional().nullable(),
  sourceUrl: z.string().url().refine((value) => value.startsWith("https://"), "La fuente debe usar HTTPS.").optional().nullable(),
  sourceDateLabel: z.string().trim().max(120).optional().nullable(),
  authorName: z.string().trim().min(2).max(120).default("Equipo MiConstructor"),
  coverImagePath: z.string().trim().regex(/^\/[A-Za-z0-9_./-]+$/).optional().nullable(),
  seoTitle: z.string().trim().min(10).max(180),
  seoDescription: z.string().trim().min(30).max(320),
  status: z.enum(["BORRADOR", "PUBLICADO"]).default("BORRADOR"),
});

type GuideRow = {
  id: string;
  slug: string;
  category: string;
  title: string;
  summary: string;
  body: string;
  price_range: string | null;
  price_metric: string | null;
  highlights: string[];
  caveats: string | null;
  source_label: string | null;
  source_url: string | null;
  source_date_label: string | null;
  author_name: string;
  cover_image_path: string | null;
  seo_title: string;
  seo_description: string;
  status: "BORRADOR" | "PUBLICADO";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const guideColumns = `id, slug, category, title, summary, body, price_range, price_metric,
  highlights, caveats, source_label, source_url, source_date_label, author_name,
  cover_image_path, seo_title, seo_description, status, published_at, created_at, updated_at`;

function articleJson(row: GuideRow) {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    title: row.title,
    summary: row.summary,
    body: row.body,
    priceRange: row.price_range,
    priceMetric: row.price_metric,
    highlights: row.highlights ?? [],
    caveats: row.caveats,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    sourceDateLabel: row.source_date_label,
    authorName: row.author_name,
    coverImagePath: row.cover_image_path,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] ?? character);

function absoluteUrl(config: AppConfig, path: string) {
  return `${config.APP_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function layout(config: AppConfig, input: {
  title: string;
  description: string;
  canonicalPath: string;
  body: string;
  jsonLd?: Record<string, unknown>;
  imagePath?: string | null;
}) {
  const canonical = absoluteUrl(config, input.canonicalPath);
  const image = input.imagePath ? absoluteUrl(config, input.imagePath) : absoluteUrl(config, "/miconstructor-platform.webp");
  const jsonLd = input.jsonLd ? `<script type="application/ld+json">${JSON.stringify(input.jsonLd).replace(/</g, "\\u003c")}</script>` : "";
  return `<!doctype html><html lang="es"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <meta name="description" content="${escapeHtml(input.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:type" content="article" /><meta property="og:site_name" content="MiConstructor" />
    <meta property="og:title" content="${escapeHtml(input.title)}" /><meta property="og:description" content="${escapeHtml(input.description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.svg" />
    <link rel="stylesheet" href="/styles.css" /><link rel="stylesheet" href="/site-shell.css" /><link rel="stylesheet" href="/guide.css" /><link rel="stylesheet" href="/guide-harmony.css" />
    ${jsonLd}
  </head><body>
    <header class="topbar"><a class="brand" href="/"><img src="/miconstructor-mark.svg" alt="" /><span>MiConstructor</span></a><nav id="main-nav" aria-label="Navegación principal"><li class="nav-item-dropdown"><button class="dropdown-toggle" type="button">Servicios ▾</button><ul class="dropdown-menu"><li><a href="/publicar?servicio=reformas">🔨 Reformas Integrales</a></li><li><a href="/publicar?servicio=limpieza">🧹 Limpieza</a></li><li><a href="/publicar?servicio=jardineria">🌳 Jardinería</a></li></ul></li><a href="/">Inicio</a><a href="/guia">Guía y precios</a><a href="/para-profesionales">Para profesionales</a><a href="/login">Entrar</a><a class="primary" href="/registro-cliente">Publicar proyecto</a></nav></header>
    <main id="app" data-guide-ssr="true">${input.body}</main>
  </body></html>`;
}

function card(row: GuideRow) {
  return `<article class="guide-card"><span class="guide-category">${escapeHtml(row.category)}</span><h2>${escapeHtml(row.title)}</h2>
    ${row.price_range ? `<div class="guide-price">${escapeHtml(row.price_range)}</div>` : ""}
    ${row.price_metric ? `<div class="guide-metric">${escapeHtml(row.price_metric)}</div>` : ""}
    <p>${escapeHtml(row.summary)}</p><a class="button" href="/guia/${escapeHtml(row.slug)}">Leer artículo →</a></article>`;
}

function articleBody(row: GuideRow) {
  const paragraphs = row.body.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  return `<article class="guide-shell guide-detail">
    <a class="guide-back" href="/guia">← Volver a Guía MiConstructor</a>
    <header class="guide-detail-hero"><span class="guide-category">${escapeHtml(row.category)}</span><h1>${escapeHtml(row.title)}</h1><p>${escapeHtml(row.summary)}</p>
      ${row.price_range ? `<div class="guide-detail-price"><strong>${escapeHtml(row.price_range)}</strong>${row.price_metric ? `<span>${escapeHtml(row.price_metric)}</span>` : ""}</div>` : ""}
    </header>
    <section class="guide-detail-grid"><div class="guide-detail-main">
      ${paragraphs}
      ${row.highlights?.length ? `<h2>Qué contempla</h2><ul>${row.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${row.caveats ? `<h2>Qué puede cambiar el precio</h2><p>${escapeHtml(row.caveats)}</p>` : ""}
      ${row.source_label && row.source_url ? `<p class="guide-source">Fuente de referencia: <a href="${escapeHtml(row.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.source_label)}</a>${row.source_date_label ? ` · ${escapeHtml(row.source_date_label)}` : ""}. Los importes son orientativos y no sustituyen un presupuesto profesional.</p>` : ""}
      <p class="guide-source">Publicado por ${escapeHtml(row.author_name)}${row.published_at ? ` · ${escapeHtml(new Date(row.published_at).toLocaleDateString("es-ES"))}` : ""}.</p>
    </div><aside class="guide-cta-card"><span class="eyebrow">TU OBRA NO ES UNA MEDIA</span><h2>Compara propuestas en la localidad real del proyecto.</h2><p>Define provincia, localidad y radio para encontrar profesionales compatibles.</p><a class="button primary" href="/registro-cliente">Publicar proyecto →</a></aside></section>
  </article>`;
}

export function contentRouter(database: Database, config: AppConfig) {
  const router = Router();

  router.get("/api/v1/guide/articles", async (_request, response, next) => {
    try {
      const result = await database.query<GuideRow>(`SELECT ${guideColumns} FROM guide_articles WHERE status='PUBLICADO' ORDER BY published_at DESC`);
      response.json({ articles: result.rows.map(articleJson) });
    } catch (error) { next(error); }
  });

  router.get("/api/v1/guide/articles/:slug", async (request, response, next) => {
    try {
      const slug = slugSchema.safeParse(request.params.slug);
      if (!slug.success) return response.status(404).json({ error: "Artículo no encontrado." });
      const result = await database.query<GuideRow>(`SELECT ${guideColumns} FROM guide_articles WHERE slug=$1 AND status='PUBLICADO' LIMIT 1`, [slug.data]);
      if (!result.rows[0]) return response.status(404).json({ error: "Artículo no encontrado." });
      response.json({ article: articleJson(result.rows[0]) });
    } catch (error) { next(error); }
  });

  router.get("/api/v1/admin/guide/articles", requireAuth, requireRole("admin"), async (_request, response, next) => {
    try {
      const result = await database.query<GuideRow>(`SELECT ${guideColumns} FROM guide_articles ORDER BY updated_at DESC`);
      response.json({ articles: result.rows.map(articleJson) });
    } catch (error) { next(error); }
  });

  router.post("/api/v1/admin/guide/articles", requireAuth, requireRole("admin"), async (request, response, next) => {
    try {
      const body = articleSchema.safeParse(request.body);
      if (!body.success) return response.status(400).json({ error: body.error.issues[0]?.message || "Artículo no válido." });
      const id = randomUUID();
      const data = body.data;
      await withTransaction(database, async (client) => {
        await client.query(
          `INSERT INTO guide_articles
            (id,slug,category,title,summary,body,price_range,price_metric,highlights,caveats,source_label,source_url,source_date_label,author_name,cover_image_path,seo_title,seo_description,status,published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,CASE WHEN $18='PUBLICADO' THEN now() ELSE NULL END)`,
          [id,data.slug,data.category,data.title,data.summary,data.body,data.priceRange ?? null,data.priceMetric ?? null,data.highlights,data.caveats ?? null,data.sourceLabel ?? null,data.sourceUrl ?? null,data.sourceDateLabel ?? null,data.authorName,data.coverImagePath ?? null,data.seoTitle,data.seoDescription,data.status],
        );
        await audit(client, { actorUserId: request.user!.id, action: "GUIDE_ARTICLE_CREATED", entityType: "guide_article", entityId: id, ip: request.ip, metadata: { slug: data.slug, status: data.status } });
      });
      response.status(201).json({ success: true, id });
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") return response.status(409).json({ error: "Ya existe un artículo con ese slug." });
      next(error);
    }
  });

  router.put("/api/v1/admin/guide/articles/:id", requireAuth, requireRole("admin"), async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      const body = articleSchema.safeParse(request.body);
      if (!id.success || !body.success) return response.status(400).json({ error: body.success ? "Artículo no válido." : body.error.issues[0]?.message });
      const data = body.data;
      const updated = await withTransaction(database, async (client) => {
        const result = await client.query(
          `UPDATE guide_articles SET slug=$2,category=$3,title=$4,summary=$5,body=$6,price_range=$7,price_metric=$8,highlights=$9,caveats=$10,
             source_label=$11,source_url=$12,source_date_label=$13,author_name=$14,cover_image_path=$15,seo_title=$16,seo_description=$17,status=$18,
             published_at=CASE WHEN $18='PUBLICADO' THEN COALESCE(published_at,now()) ELSE NULL END,updated_at=now()
           WHERE id=$1 RETURNING id`,
          [id.data,data.slug,data.category,data.title,data.summary,data.body,data.priceRange ?? null,data.priceMetric ?? null,data.highlights,data.caveats ?? null,data.sourceLabel ?? null,data.sourceUrl ?? null,data.sourceDateLabel ?? null,data.authorName,data.coverImagePath ?? null,data.seoTitle,data.seoDescription,data.status],
        );
        if (!result.rows[0]) return false;
        await audit(client, { actorUserId: request.user!.id, action: "GUIDE_ARTICLE_UPDATED", entityType: "guide_article", entityId: id.data, ip: request.ip, metadata: { slug: data.slug, status: data.status } });
        return true;
      });
      if (!updated) return response.status(404).json({ error: "Artículo no encontrado." });
      response.json({ success: true });
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") return response.status(409).json({ error: "Ya existe un artículo con ese slug." });
      next(error);
    }
  });

  router.delete("/api/v1/admin/guide/articles/:id", requireAuth, requireRole("admin"), async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return response.status(400).json({ error: "Artículo no válido." });
      const removed = await withTransaction(database, async (client) => {
        const result = await client.query<{ slug: string }>("DELETE FROM guide_articles WHERE id=$1 AND status='BORRADOR' RETURNING slug", [id.data]);
        if (!result.rows[0]) return null;
        await audit(client, { actorUserId: request.user!.id, action: "GUIDE_ARTICLE_DELETED", entityType: "guide_article", entityId: id.data, ip: request.ip, metadata: { slug: result.rows[0].slug } });
        return result.rows[0];
      });
      if (!removed) return response.status(409).json({ error: "Solo se pueden eliminar borradores. Pasa el artículo a borrador primero." });
      response.json({ success: true });
    } catch (error) { next(error); }
  });

  router.get("/guia", async (_request, response, next) => {
    try {
      const result = await database.query<GuideRow>(`SELECT ${guideColumns} FROM guide_articles WHERE status='PUBLICADO' ORDER BY published_at DESC`);
      const body = `<section class="guide-shell"><header class="guide-hero"><span class="eyebrow">GUÍA MICONSTRUCTOR · ESPAÑA</span><h1>Precios, consejos y casos para decidir una reforma con más contexto.</h1><p>Referencias explicadas con fuentes identificadas. Las opiniones de MiConstructor se publican únicamente cuando proceden de proyectos verificados.</p><div class="actions"><a class="button primary" href="/registro-cliente">Publicar mi proyecto →</a></div></header><section class="guide-section"><div class="guide-section-head"><span class="eyebrow">ARTÍCULOS Y CASOS</span><h2>Guías publicadas</h2></div><div class="guide-grid">${result.rows.map(card).join("")}</div></section></section>`;
      response.type("html").send(layout(config, { title: "Guía de reformas, precios y casos | MiConstructor", description: "Guía MiConstructor con referencias de precios, consejos y casos orientativos de reformas en España, con fuentes identificadas.", canonicalPath: "/guia", body }));
    } catch (error) { next(error); }
  });

  router.get("/guia/:slug", async (request, response, next) => {
    try {
      const slug = slugSchema.safeParse(request.params.slug);
      if (!slug.success) return response.status(404).type("text/plain").send("Artículo no encontrado.");
      const result = await database.query<GuideRow>(`SELECT ${guideColumns} FROM guide_articles WHERE slug=$1 AND status='PUBLICADO' LIMIT 1`, [slug.data]);
      const row = result.rows[0];
      if (!row) return response.status(404).type("text/plain").send("Artículo no encontrado.");
      const canonicalPath = `/guia/${row.slug}`;
      const canonical = absoluteUrl(config, canonicalPath);
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: row.title,
        description: row.seo_description,
        datePublished: row.published_at,
        dateModified: row.updated_at,
        mainEntityOfPage: canonical,
        author: { "@type": "Organization", name: row.author_name },
        publisher: { "@type": "Organization", name: "MiConstructor", url: config.APP_URL },
        ...(row.cover_image_path ? { image: [absoluteUrl(config, row.cover_image_path)] } : {}),
      };
      response.type("html").send(layout(config, { title: row.seo_title, description: row.seo_description, canonicalPath, body: articleBody(row), jsonLd, imagePath: row.cover_image_path }));
    } catch (error) { next(error); }
  });

  router.get("/sitemap.xml", async (_request, response, next) => {
    try {
      const result = await database.query<Pick<GuideRow, "slug" | "updated_at">>("SELECT slug, updated_at FROM guide_articles WHERE status='PUBLICADO' ORDER BY published_at DESC");
      const staticPaths = ["/", "/guia", "/para-profesionales", "/servicios-hogar"];
      const urls = [
        ...staticPaths.map((path) => `<url><loc>${escapeHtml(absoluteUrl(config, path))}</loc></url>`),
        ...result.rows.map((row) => `<url><loc>${escapeHtml(absoluteUrl(config, `/guia/${row.slug}`))}</loc><lastmod>${escapeHtml(new Date(row.updated_at).toISOString())}</lastmod></url>`),
      ].join("");
      response.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
    } catch (error) { next(error); }
  });

  router.get("/robots.txt", (_request, response) => {
    response.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${absoluteUrl(config, "/sitemap.xml")}\n`);
  });

  return router;
}
