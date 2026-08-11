const PORTAL_OWNED_PATHS = new Set([
  "/registro",
  "/registro-cliente",
  "/para-profesionales",
  "/registro-profesional",
]);

if (!PORTAL_OWNED_PATHS.has(window.location.pathname)) {
  await import("/app.js");
}
