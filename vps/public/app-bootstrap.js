const DEDICATED_ROUTE_PATHS = new Set([
  "/registro",
  "/registro-cliente",
  "/para-profesionales",
  "/registro-profesional",
  "/servicios-hogar",
]);

if (!DEDICATED_ROUTE_PATHS.has(window.location.pathname)) {
  await import("/app.js");
}
