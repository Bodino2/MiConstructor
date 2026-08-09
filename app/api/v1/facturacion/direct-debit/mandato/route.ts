import { databaseError, getD1, requireBillingJob } from "@/lib/server/d1";
import { normalizeEmail } from "@/lib/server/identity";
import { isValidEmail } from "@/lib/validation";

export async function POST(request: Request) {
  const denied = requireBillingJob(request);
  if (denied) return denied;
  try {
    const payload = (await request.json()) as {
      profesionalEmail?: unknown;
      estado?: unknown;
      clienteProveedor?: unknown;
      mandatoProveedor?: unknown;
    };
    const email = normalizeEmail(payload.profesionalEmail);
    const status = String(payload.estado ?? "").toUpperCase();
    const customerRef = String(payload.clienteProveedor ?? "").slice(0, 200);
    const mandateRef = String(payload.mandatoProveedor ?? "").slice(0, 200);
    if (!isValidEmail(email) || !["ACTIVO", "REVOCADO"].includes(status) || (status === "ACTIVO" && (!customerRef || !mandateRef))) {
      return Response.json({ error: "Resultado de mandato no válido." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const result = await getD1()
      .prepare(
        `UPDATE professional_billing_accounts
            SET status = ?1, payment_customer_ref = ?2,
                direct_debit_mandate_ref = ?3, updated_at = ?4
          WHERE professional_email = ?5 AND overdue_balance_cents = 0`,
      )
      .bind(status === "ACTIVO" ? "ACTIVO" : "PENDIENTE_MANDATO", status === "ACTIVO" ? customerRef : null, status === "ACTIVO" ? mandateRef : null, now, email)
      .run();
    if (!result.meta.changes) return Response.json({ error: "Cuenta no encontrada o con deuda pendiente." }, { status: 404 });
    return Response.json({ success: true, data: { estado: status } });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
