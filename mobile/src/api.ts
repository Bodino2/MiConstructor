import { Platform } from "react-native";
import type {
  AdminOverview,
  Assessment,
  AuthUser,
  BillingSummary,
  Project,
  RuntimeConfig,
  Specialty,
  SupportMessage,
  SupportThread,
} from "./types";

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "https://miconstructor.es").replace(/\/$/, "");

let authToken: string | null = null;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function setApiToken(token: string | null) {
  authToken = token;
}

export function getApiToken() {
  return authToken;
}

type ApiOptions = RequestInit & { timeoutMs?: number };

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const headers = new Headers(options.headers || {});
    headers.set("accept", "application/json");
    headers.set("x-miconstructor-client", "mobile");
    headers.set("x-miconstructor-platform", Platform.OS);
    if (authToken) headers.set("authorization", `Bearer ${authToken}`);
    if (options.body && typeof options.body === "string" && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload: unknown = contentType.includes("json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Error HTTP ${response.status}`;
      throw new ApiError(message, response.status, payload);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("La conexión con MiConstructor ha tardado demasiado.", 0, null);
    }
    throw new ApiError("No se ha podido conectar con MiConstructor.", 0, error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function mobileLogin(email: string, password: string) {
  return apiRequest<{
    success: true;
    token: string;
    tokenType: "Bearer";
    expiresInSeconds: number;
    user: AuthUser;
  }>("/api/v1/auth/mobile-login", {
    method: "POST",
    body: JSON.stringify({ email, password, platform: Platform.OS }),
  });
}

export async function currentUser() {
  return apiRequest<{ user: AuthUser }>("/api/v1/auth/me");
}

export async function logout() {
  return apiRequest<void>("/api/v1/auth/logout", { method: "POST" });
}

export async function forgotPassword(email: string) {
  return apiRequest<{ success: boolean; message: string }>("/api/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function runtimeConfig() {
  return apiRequest<RuntimeConfig>("/api/v1/config");
}

export async function specialties() {
  return apiRequest<{ specialties: Specialty[] }>("/api/v1/assessments");
}

export async function assessment(specialty: string) {
  return apiRequest<{ assessment: Assessment }>(`/api/v1/assessments/${encodeURIComponent(specialty)}`);
}

export async function registerAccount(payload: Record<string, unknown>) {
  return apiRequest<{ success: boolean; message: string }>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function projects() {
  return apiRequest<{ projects: Project[] }>("/api/v1/projects");
}

export async function projectDetails(id: string) {
  return apiRequest<{ project: Project }>(`/api/v1/projects/${encodeURIComponent(id)}`);
}

export async function createProject(payload: Record<string, unknown>) {
  return apiRequest<{ success: boolean; project: Project }>("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitProposal(payload: Record<string, unknown>) {
  return apiRequest<{ success: boolean }>("/api/v1/proposals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function shortlist(projectId: string, professionalId: string) {
  return apiRequest<{ success: boolean; contact: { email: string; phone?: string | null } }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/shortlist`,
    { method: "POST", body: JSON.stringify({ professionalId }) },
  );
}

export async function billing() {
  return apiRequest<BillingSummary>("/api/v1/billing/me");
}

export async function retrySelectionCharge(id: string) {
  return apiRequest<{ success: boolean; status: string }>(`/api/v1/billing/charges/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    body: "{}",
  });
}

export async function supportMessages() {
  return apiRequest<{ messages: SupportMessage[] }>("/api/v1/support/messages");
}

export async function sendSupportMessage(body: string) {
  return apiRequest<{ message: SupportMessage }>("/api/v1/support/messages", {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function adminOverview() {
  return apiRequest<AdminOverview>("/api/v1/admin/overview");
}

export async function adminUsers() {
  return apiRequest<{ users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    company_name?: string | null;
    account_status: string;
    verification_status: string;
    created_at: string;
    last_login_at?: string | null;
    billing_status?: string | null;
    overdue_balance_cents?: number | string;
  }> }>("/api/v1/admin/users?limit=200");
}

export async function adminProjects() {
  return apiRequest<{ projects: Array<{
    id: string;
    title: string;
    category: string;
    location: string;
    status: string;
    budget_cents: number | string;
    owner_name: string;
    owner_email: string;
    proposal_count: number | string;
    shortlist_count: number | string;
    has_contract: boolean;
    created_at: string;
  }> }>("/api/v1/admin/projects?limit=200");
}

export async function adminAudit() {
  return apiRequest<{ events: Array<{
    id: number | string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    ip_address?: string | null;
    metadata?: Record<string, unknown>;
    created_at: string;
    actor_name?: string | null;
    actor_email?: string | null;
  }> }>("/api/v1/admin/audit?limit=200");
}

export async function adminThreads() {
  return apiRequest<{ threads: SupportThread[] }>("/api/v1/support/admin/threads");
}

export async function adminThreadMessages(userId: string) {
  return apiRequest<{
    user: { id: string; name: string; email: string; role: string; account_status: string };
    messages: SupportMessage[];
  }>(`/api/v1/support/admin/threads/${encodeURIComponent(userId)}/messages`);
}

export async function adminReply(userId: string, body: string) {
  return apiRequest<{ message: SupportMessage }>(`/api/v1/support/admin/threads/${encodeURIComponent(userId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
