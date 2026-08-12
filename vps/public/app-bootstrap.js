const DEDICATED_ROUTE_PATHS = new Set([
  "/registro",
  "/registro-cliente",
  "/para-profesionales",
  "/registro-profesional",
  "/servicios-hogar",
]);

const dedicatedCampaignRoute = window.location.pathname.startsWith("/campana/");

if (!DEDICATED_ROUTE_PATHS.has(window.location.pathname) && !dedicatedCampaignRoute) {
  await import("/app.js");
}
