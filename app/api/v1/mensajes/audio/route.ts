import { databaseError, getD1, getR2 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { safeObjectExtension, validateUpload } from "@/lib/media-validation";

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;
  let objectKey = "";
  try {
    const form = await request.formData();
    const conversationId = Number(form.get("conversacionId"));
    const audio = form.get("audio");
    const validation = validateUpload(audio, "audio");
    if (!Number.isInteger(conversationId) || conversationId < 1 || !validation.valid) {
      return Response.json({ error: validation.error ?? "Audio no válido." }, { status: 400 });
    }
    const db = getD1();
    const conversation = await db
      .prepare("SELECT client_email, professional_email, contact_unlocked_at FROM conversations WHERE id = ?1")
      .bind(conversationId)
      .first<{ client_email: string; professional_email: string; contact_unlocked_at: string | null }>();
    if (!conversation || ![conversation.client_email, conversation.professional_email].includes(identity)) {
      return Response.json({ error: "Conversación no encontrada." }, { status: 404 });
    }
    if (!conversation.contact_unlocked_at) {
      return Response.json({ error: "Los mensajes de voz se activan después de desbloquear el contacto." }, { status: 422 });
    }
    objectKey = `chat/${conversationId}/${crypto.randomUUID()}.${safeObjectExtension(audio.type)}`;
    await getR2().put(objectKey, audio.stream(), { httpMetadata: { contentType: audio.type }, customMetadata: { sender: identity, conversationId: String(conversationId) } });
    const created = await db
      .prepare(
        `INSERT INTO conversation_messages
          (conversation_id, sender_email, message_type, body, audio_object_key,
           blocked_sensitive_data, created_at)
         VALUES (?1, ?2, 'AUDIO', NULL, ?3, 0, ?4)`,
      )
      .bind(conversationId, identity, objectKey, new Date().toISOString())
      .run();
    return Response.json({ success: true, data: { messageId: created.meta.last_row_id } }, { status: 201 });
  } catch (error) {
    if (objectKey) await getR2().delete(objectKey);
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
