import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  adminReply,
  adminThreadMessages,
  adminThreads,
  sendSupportMessage,
  supportMessages,
} from "../api";
import { colors } from "../theme";
import type { AuthUser, SupportMessage, SupportThread } from "../types";
import { ActionButton, Card, Empty, ErrorNotice, Field, Loading, SectionTitle, shortDate } from "../ui";

export function SupportScreen({ user }: { user: AuthUser }) {
  return user.role === "admin" ? <AdminSupport /> : <UserSupport />;
}

function UserSupport() {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await supportMessages();
      setMessages(result.messages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido cargar el chat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await sendSupportMessage(body.trim());
      setBody("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido enviar el mensaje.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Cargando conversación…" />;
  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="SOPORTE" title="Chat con MiConstructor" detail="La conversación queda guardada en tu cuenta para mantener trazabilidad de la incidencia." />
      {error ? <ErrorNotice message={error} /> : null}
      {!messages.length ? <Empty title="Inicia una conversación" detail="Describe la consulta y soporte podrá responder desde el panel de administración." /> : messages.map((message) => <Message key={String(message.id)} message={message} />)}
      <Card>
        <Field label="Mensaje" value={body} onChangeText={setBody} multiline maxLength={4000} placeholder="Escribe tu consulta…" />
        <ActionButton label={busy ? "Enviando…" : "Enviar"} disabled={busy || !body.trim()} onPress={() => void send()} />
      </Card>
      <ActionButton label="Actualizar conversación" variant="ghost" onPress={() => void refresh()} />
    </View>
  );
}

function AdminSupport() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selected, setSelected] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadThreads() {
    setLoading(true);
    setError("");
    try {
      const result = await adminThreads();
      setThreads(result.threads);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido cargar la bandeja de soporte.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadThreads(); }, []);

  async function openThread(thread: SupportThread) {
    setSelected(thread);
    setLoading(true);
    setError("");
    try {
      const result = await adminThreadMessages(thread.user_id);
      setMessages(result.messages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido abrir la conversación.");
    } finally {
      setLoading(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      await adminReply(selected.user_id, reply.trim());
      setReply("");
      await openThread(selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido responder.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label={selected ? "Cargando conversación…" : "Cargando soporte…"} />;

  if (selected) {
    return (
      <View style={styles.wrap}>
        <ActionButton label="← Volver a conversaciones" variant="ghost" onPress={() => { setSelected(null); setMessages([]); void loadThreads(); }} />
        <SectionTitle eyebrow="SOPORTE ADMIN" title={selected.name} detail={`${selected.email} · ${selected.role}`} />
        {error ? <ErrorNotice message={error} /> : null}
        {messages.map((message) => <Message key={String(message.id)} message={message} adminView />)}
        <Card>
          <Field label="Respuesta" value={reply} onChangeText={setReply} multiline maxLength={4000} />
          <ActionButton label={busy ? "Enviando…" : "Responder"} disabled={busy || !reply.trim()} onPress={() => void sendReply()} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="SOPORTE ADMIN" title="Conversaciones" detail="Bandeja persistente de consultas de clientes y profesionales." />
      {error ? <ErrorNotice message={error} /> : null}
      {!threads.length ? <Empty title="No hay conversaciones" /> : threads.map((thread) => (
        <Pressable key={thread.user_id} onPress={() => void openThread(thread)}>
          <Card>
            <View style={styles.threadHead}><Text style={styles.threadName}>{thread.name}</Text>{Number(thread.unread_count) > 0 ? <View style={styles.unread}><Text style={styles.unreadText}>{thread.unread_count}</Text></View> : null}</View>
            <Text style={styles.meta}>{thread.email} · {thread.role}</Text>
            <Text style={styles.preview} numberOfLines={2}>{thread.last_message}</Text>
            <Text style={styles.meta}>{shortDate(thread.last_message_at)}</Text>
          </Card>
        </Pressable>
      ))}
      <ActionButton label="Actualizar" variant="ghost" onPress={() => void loadThreads()} />
    </View>
  );
}

function Message({ message, adminView = false }: { message: SupportMessage; adminView?: boolean }) {
  const own = adminView ? message.sender_role === "admin" : message.sender_role === "usuario";
  return (
    <View style={[styles.message, own ? styles.messageOwn : styles.messageOther]}>
      <Text style={styles.messageBody}>{message.body}</Text>
      <Text style={styles.messageMeta}>{own ? "Tú" : message.sender_role === "admin" ? "Soporte" : "Usuario"} · {shortDate(message.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  message: { maxWidth: "90%", borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 5 },
  messageOwn: { alignSelf: "flex-end", backgroundColor: "#EDF8F6", borderColor: "#C9E2DD" },
  messageOther: { alignSelf: "flex-start", backgroundColor: "white" },
  messageBody: { color: colors.text, lineHeight: 20 },
  messageMeta: { color: colors.muted, fontSize: 11 },
  threadHead: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center" },
  threadName: { color: colors.primary, fontSize: 18, fontWeight: "900", flex: 1 },
  unread: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.cta },
  unreadText: { color: "white", fontWeight: "900", fontSize: 12 },
  meta: { color: colors.muted, fontSize: 12 },
  preview: { color: colors.text, lineHeight: 19 },
});
