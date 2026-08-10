import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { inspectSensitiveContactData } from "@/lib/sensitive-data-filter";
import { cleanText } from "@/lib/validation";

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;
  try {
    const payload = (await request.json()) as { conversacionId?: unknown; mensaje?: unknown };
    const conversationId = Number(payload.conversacionId);
    const message = cleanText(payload.mensaje, 3_000);
    if (!Number.isInteger(conversationId) || conversationId < 1 || !message) {
      return Response.json({ error: "Conversación y mensaje son obligatorios." }, { status: 400 });
    }
    const db = getD1();
    const conversation = await db
      .prepare("SELECT client_email, professional_email, contact_unlocked_at FROM conversations WHERE id = ?1")
      .bind(conversationId)
      .first<{ client_email: string; professional_email: string; contact_unlocked_at: string | null }>();
    if (!conversation || ![conversation.client_email, conversation.professional_email].includes(identity)) {
      return Response.json({ error: "Conversación no encontrada." }, { status: 404 });
    }
    const inspection = inspectSensitiveContactData(message);
    if (!conversation.contact_unlocked_at && inspection.blocked) {
      await db
        .prepare(
          `INSERT INTO conversation_messages
            (conversation_id, sender_email, message_type, body,
             blocked_sensitive_data, created_at)
           VALUES (?1, ?2, 'TEXTO', NULL, 1, ?3)`,
        )
        .bind(conversationId, identity, new Date().toISOString())
        .run();
      return Response.json(
        { error: "No se pueden compartir teléfonos, emails, IBAN o enlaces hasta desbloquear el contacto.", tiposDetectados: inspection.types },
        { status: 422 },
      );
    }
    const created = await db
      .prepare(
        `INSERT INTO conversation_messages
          (conversation_id, sender_email, message_type, body,
           blocked_sensitive_data, created_at)
         VALUES (?1, ?2, 'TEXTO', ?3, 0, ?4)`,
      )
      .bind(conversationId, identity, message, new Date().toISOString())
      .run();
    return Response.json({ success: true, data: { messageId: created.meta.last_row_id } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
