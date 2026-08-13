import { Router } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import { requireAuth, requireRole } from "../services/auth.js";

const codeSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const eventSchema = z.object({
  code: codeSchema,
  eventType: z.enum(["LANDING_VIEW", "CTA_CLICK", "SIGNUP"]),
  path: z.string().trim().startsWith("/").max(300).optional(),
});
const adminWindowSchema = z.enum(["7", "30", "90", "365", "all"]);

type CampaignRow = {
  id: string;
  slug: string;
  code: string;
  name: string;
  audience: "cliente" | "profesional";
  channel: string;
  landing_path: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  headline: string;
  subheadline: string;
  cta_label: string;
  cta_path: string;
};

type PublicReviewRow = {
  professional_name: string;
  rating: number | string;
  comment: string;
  published_at: string;
  category: string;
  service_locality: string | null;
  service_province: string | null;
  agreed_amount_cents: string;
  estimated_days: number;
  public_price_consent: boolean;
};

const activeWindow = `active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now())`;

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] ?? character);

function attributedPath(campaign: CampaignRow, path: string) {
  const url = new URL(path, "https://miconstructor.local");
  url.searchParams.set("utm_source", campaign.utm_source);
  url.searchParams.set("utm_medium", campaign.utm_medium);
  url.searchParams.set("utm_campaign", campaign.utm_campaign);
  if (campaign.utm_content) url.searchParams.set("utm_content", campaign.utm_content);
  url.searchParams.set("mc", campaign.code);
  return `${url.pathname}${url.search}`;
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

async function activeCampaignByCode(database: Database, code: string) {
  const result = await database.query<CampaignRow>(
    `SELECT id, slug, code, name, audience, channel, landing_path,
            utm_source, utm_medium, utm_campaign, utm_content,
            headline, subheadline, cta_label, cta_path
       FROM marketing_campaigns
      WHERE code = $1 AND ${activeWindow}
      LIMIT 1`,
    [code],
  );
  return result.rows[0] ?? null;
}

function verifiedReviewsHtml(rows: PublicReviewRow[]) {
  const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const cards = rows.length ? rows.map((row) => {
    const locality = row.service_locality && row.service_province
      ? `${escapeHtml(row.service_locality)}, ${escapeHtml(row.service_province)}`
      : "Ubicación no publicada";
    const price = row.public_price_consent
      ? `<span><strong>Precio final</strong>${escapeHtml(money.format(Number(row.agreed_amount_cents) / 100))}</span>`
      : `<span><strong>Precio final</strong>No publicado</span>`;
    return `<article class="verified-review-card">
      <div class="verified-review-head"><div><span class="eyebrow">OPINIÓN VERIFICADA</span><h2>${escapeHtml(row.professional_name)}</h2></div><strong class="verified-stars">${"★".repeat(Number(row.rating))}</strong></div>
      <p class="verified-comment">${escapeHtml(row.comment)}</p>
      <div class="verified-review-meta"><span><strong>Trabajo</strong>${escapeHtml(row.category)}</span><span><strong>Zona</strong>${locality}</span>${price}<span><strong>Plazo acordado</strong>${escapeHtml(row.estimated_days)} días</span></div>
      <footer>Proyecto finalizado y vinculado a un contrato MiConstructor · ${escapeHtml(new Date(row.published_at).toLocaleDateString("es-ES"))}</footer>
    </article>`;
  }).join("") : `<div class="empty"><strong>Aún no hay opiniones públicas.</strong><p>Solo aparecerán reseñas de trabajos finalizados y con consentimiento explícito del cliente.</p></div>`;

  return `<!doctype html><html lang="es"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opiniones verificadas de reformas | MiConstructor</title>
    <meta name="description" content="Opiniones verificadas de clientes sobre trabajos finalizados mediante MiConstructor. Sin testimonios inventados y con publicación consentida." />
    <meta name="robots" content="index,follow" />
    <link rel="icon" href="/favicon.svg" /><link rel="stylesheet" href="/styles.css" /><link rel="stylesheet" href="/site-shell.css" /><link rel="stylesheet" href="/verified-reviews.css" />
  </head><body>
    <header class="topbar"><a class="brand" href="/"><img src="/miconstructor-mark.svg" alt="" /><span>MiConstructor</span></a><nav id="main-nav" aria-label="Navegación principal"><li class="nav-item-dropdown"><button class="dropdown-toggle" type="button">Servicios ▾</button><ul class="dropdown-menu"><li><a href="/publicar?servicio=reformas">🔨 Reformas Integrales</a></li><li><a href="/publicar?servicio=limpieza">🧹 Limpieza</a></li><li><a href="/publicar?servicio=jardineria">🌳 Jardinería</a></li></ul></li><a href="/">Inicio</a><a href="/guia">Guía y precios</a><a href="/opiniones">Opiniones verificadas</a><a href="/para-profesionales">Para profesionales</a><a href="/login">Entrar</a><a class="primary" href="/registro-cliente">Publicar proyecto</a></nav></header>
    <main class="verified-reviews-shell"><header class="verified-reviews-hero"><span class="eyebrow">TRABAJOS REALES · RESEÑAS VERIFICADAS</span><h1>Opiniones vinculadas a proyectos finalizados.</h1><p>No compramos testimonios ni mostramos reseñas anónimas sin trazabilidad. Una opinión pública procede de un cliente con un proyecto finalizado y consentimiento explícito para publicarla.</p></header><section class="verified-reviews-list">${cards}</section></main>
  </body></html>`;
}

export function marketingRedirectRouter(database: Database) {
  const router = Router();

  router.get("/opiniones", async (_request, response, next) => {
    try {
      // Release consented blind reviews after their seal expires. The update is
      // idempotent and only applies to client -> professional reviews on finished projects.
      await database.query(
        `UPDATE reviews r
            SET status='PUBLICADA', published_at=COALESCE(r.published_at,now())
           FROM work_contracts c, projects p
          WHERE r.project_id=c.project_id
            AND p.id=r.project_id
            AND r.author_id=c.client_id
            AND r.subject_id=c.professional_id
            AND p.status='FINALIZADO'
            AND r.status='SELLADA'
            AND r.publication_consent=true
            AND r.publish_after<=now()`,
      );
      const result = await database.query<PublicReviewRow>(
        `SELECT COALESCE(NULLIF(pro.company_name,''),pro.name) AS professional_name,
                r.rating, r.comment, r.published_at::text, p.category,
                p.service_locality, p.service_province,
                c.agreed_amount_cents::text, c.estimated_days,
                r.public_price_consent
           FROM reviews r
           JOIN work_contracts c ON c.project_id=r.project_id
           JOIN projects p ON p.id=r.project_id
           JOIN users pro ON pro.id=c.professional_id
          WHERE r.author_id=c.client_id
            AND r.subject_id=c.professional_id
            AND r.status='PUBLICADA'
            AND r.publication_consent=true
            AND p.status='FINALIZADO'
          ORDER BY r.published_at DESC
          LIMIT 100`,
      );
      response.setHeader("cache-control", "public, max-age=300");
      return response.type("html").send(verifiedReviewsHtml(result.rows));
    } catch (error) { next(error); }
  });

  router.get("/r/:code", async (request, response, next) => {
    try {
      const parsed = codeSchema.safeParse(request.params.code);
      if (!parsed.success) return response.status(404).type("text/plain").send("Campaña no encontrada.");
      const campaign = await activeCampaignByCode(database, parsed.data);
      if (!campaign) return response.status(404).type("text/plain").send("Campaña no encontrada.");
      await database.query(
        `INSERT INTO marketing_events (campaign_id, event_type, path)
         VALUES ($1, 'QR_SCAN', $2)`,
        [campaign.id, request.path],
      );
      response.setHeader("cache-control", "no-store");
      return response.redirect(302, attributedPath(campaign, campaign.landing_path));
    } catch (error) { next(error); }
  });

  return router;
}

export function marketingRouter(database: Database) {
  const router = Router();

  router.get("/marketing/campaigns/:slug", async (request, response, next) => {
    try {
      const parsed = slugSchema.safeParse(request.params.slug);
      if (!parsed.success) return response.status(404).json({ error: "Campaña no encontrada." });
      const result = await database.query<CampaignRow>(
        `SELECT id, slug, code, name, audience, channel, landing_path,
                utm_source, utm_medium, utm_campaign, utm_content,
                headline, subheadline, cta_label, cta_path
           FROM marketing_campaigns
          WHERE slug = $1 AND ${activeWindow}
          LIMIT 1`,
        [parsed.data],
      );
      const campaign = result.rows[0];
      if (!campaign) return response.status(404).json({ error: "Campaña no encontrada." });
      return response.json({
        campaign: {
          slug: campaign.slug,
          code: campaign.code,
          name: campaign.name,
          audience: campaign.audience,
          headline: campaign.headline,
          subheadline: campaign.subheadline,
          ctaLabel: campaign.cta_label,
          ctaHref: attributedPath(campaign, campaign.cta_path),
        },
      });
    } catch (error) { next(error); }
  });

  router.post("/marketing/events", async (request, response, next) => {
    try {
      const parsed = eventSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: "Evento de campaña no válido." });
      const campaign = await activeCampaignByCode(database, parsed.data.code);
      if (!campaign) return response.status(404).json({ error: "Campaña no encontrada." });
      await database.query(
        `INSERT INTO marketing_events (campaign_id, event_type, path)
         VALUES ($1, $2, $3)`,
        [campaign.id, parsed.data.eventType, parsed.data.path ?? null],
      );
      return response.status(202).json({ accepted: true });
    } catch (error) { next(error); }
  });

  router.get("/admin/marketing", requireAuth, requireRole("admin"), async (request, response, next) => {
    try {
      const parsed = adminWindowSchema.safeParse(String(request.query.days ?? "30"));
      if (!parsed.success) return response.status(400).json({ error: "Periodo de marketing no válido." });
      const days = parsed.data === "all" ? null : Number(parsed.data);
      const result = await database.query<{
        slug: string;
        code: string;
        name: string;
        audience: string;
        channel: string;
        active: boolean;
        qr_scans: string;
        landing_views: string;
        cta_clicks: string;
        signups: string;
        last_event_at: string | null;
      }>(
        `SELECT c.slug, c.code, c.name, c.audience, c.channel, c.active,
                count(*) FILTER (WHERE e.event_type = 'QR_SCAN')::text AS qr_scans,
                count(*) FILTER (WHERE e.event_type = 'LANDING_VIEW')::text AS landing_views,
                count(*) FILTER (WHERE e.event_type = 'CTA_CLICK')::text AS cta_clicks,
                count(*) FILTER (WHERE e.event_type = 'SIGNUP')::text AS signups,
                max(e.created_at)::text AS last_event_at
           FROM marketing_campaigns c
           LEFT JOIN marketing_events e
             ON e.campaign_id = c.id
            AND ($1::integer IS NULL OR e.created_at >= now() - ($1::integer * interval '1 day'))
          GROUP BY c.id
          ORDER BY c.created_at DESC`,
        [days],
      );
      const campaigns = result.rows.map((row) => {
        const qrScans = Number(row.qr_scans || 0);
        const landingViews = Number(row.landing_views || 0);
        const ctaClicks = Number(row.cta_clicks || 0);
        const signups = Number(row.signups || 0);
        return {
          slug: row.slug,
          code: row.code,
          name: row.name,
          audience: row.audience,
          channel: row.channel,
          active: row.active,
          qrScans,
          landingViews,
          ctaClicks,
          signups,
          conversions: {
            scanToLandingPct: percentage(landingViews, qrScans),
            landingToCtaPct: percentage(ctaClicks, landingViews),
            ctaToSignupPct: percentage(signups, ctaClicks),
            scanToSignupPct: percentage(signups, qrScans),
          },
          lastEventAt: row.last_event_at,
        };
      });
      const totals = campaigns.reduce((acc, item) => ({
        qrScans: acc.qrScans + item.qrScans,
        landingViews: acc.landingViews + item.landingViews,
        ctaClicks: acc.ctaClicks + item.ctaClicks,
        signups: acc.signups + item.signups,
      }), { qrScans: 0, landingViews: 0, ctaClicks: 0, signups: 0 });
      return response.json({
        windowDays: days,
        totals: {
          ...totals,
          scanToSignupPct: percentage(totals.signups, totals.qrScans),
        },
        campaigns,
      });
    } catch (error) { next(error); }
  });

  return router;
}
