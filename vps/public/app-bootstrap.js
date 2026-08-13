const DEDICATED_ROUTE_PATHS = new Set([
  "/registro",
  "/registro-cliente",
  "/para-profesionales",
  "/registro-profesional",
  "/servicios-hogar",
]);

const dedicatedCampaignRoute = window.location.pathname.startsWith("/campana/");
const dedicatedGuideRoute = window.location.pathname === "/guia" || window.location.pathname.startsWith("/guia/");

if (!DEDICATED_ROUTE_PATHS.has(window.location.pathname) && !dedicatedCampaignRoute && !dedicatedGuideRoute) {
  await import("/app.js");
}
