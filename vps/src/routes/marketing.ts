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

const activeWindow = `active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now())`;

function attributedPath(campaign: CampaignRow, path: string) {
  const url = new URL(path, "https://miconstructor.local");
  url.searchParams.set("utm_source", campaign.utm_source);
  url.searchParams.set("utm_medium", campaign.utm_medium);
  url.searchParams.set("utm_campaign", campaign.utm_campaign);
  if (campaign.utm_content) url.searchParams.set("utm_content", campaign.utm_content);
  url.searchParams.set("mc", campaign.code);
  return `${url.pathname}${url.search}`;
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

export function marketingRedirectRouter(database: Database) {
  const router = Router();

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

  router.get("/admin/marketing", requireAuth, requireRole("admin"), async (_request, response, next) => {
    try {
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
           LEFT JOIN marketing_events e ON e.campaign_id = c.id
          GROUP BY c.id
          ORDER BY c.created_at DESC`,
      );
      return response.json({
        campaigns: result.rows.map((row) => ({
          slug: row.slug,
          code: row.code,
          name: row.name,
          audience: row.audience,
          channel: row.channel,
          active: row.active,
          qrScans: Number(row.qr_scans || 0),
          landingViews: Number(row.landing_views || 0),
          ctaClicks: Number(row.cta_clicks || 0),
          signups: Number(row.signups || 0),
          lastEventAt: row.last_event_at,
        })),
      });
    } catch (error) { next(error); }
  });

  return router;
}
