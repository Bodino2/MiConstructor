const AUTHENTICATED_EMAIL_HEADER = "oai-authenticated-user-email";
const DEMO_EMAIL_HEADER = "x-miconstructor-demo-email";

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getIdentityEmail(request: Request): string | null {
  const authenticated = normalizeEmail(
    request.headers.get(AUTHENTICATED_EMAIL_HEADER),
  );
  if (authenticated) return authenticated;

  const hostname = new URL(request.url).hostname;
  if (["localhost", "127.0.0.1", "terminal.local"].includes(hostname)) {
    return normalizeEmail(request.headers.get(DEMO_EMAIL_HEADER)) || null;
  }

  return null;
}

export function requireIdentity(request: Request): string | Response {
  const email = getIdentityEmail(request);
  if (email) return email;

  return Response.json(
    { error: "Debes iniciar sesión para continuar." },
    { status: 401 },
  );
}
