import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { adminOverview, billing, projects } from "../api";
import { colors } from "../theme";
import type { AdminOverview, AuthUser, BillingSummary, Project } from "../types";
import { Badge, Card, ErrorNotice, Loading, Metric, SectionTitle, money } from "../ui";

export function HomeScreen({ user }: { user: AuthUser }) {
  const [projectItems, setProjectItems] = useState<Project[]>([]);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [admin, setAdmin] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (user.role === "admin") {
          const result = await adminOverview();
          if (alive) setAdmin(result);
        } else {
          const result = await projects();
          if (alive) setProjectItems(result.projects);
          if (user.role === "profesional") {
            const bill = await billing();
            if (alive) setBillingSummary(bill);
          }
        }
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "No se ha podido cargar el resumen.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [user.role]);

  if (loading) return <Loading label="Preparando tu panel…" />;

  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="MICONSTRUCTOR MOBILE" title={`Hola, ${user.name.split(" ")[0] || user.name}`} detail="Tu actividad sincronizada con la plataforma web." />
      {error ? <ErrorNotice message={error} /> : null}
      <Card>
        <Text style={styles.label}>Estado de cuenta</Text>
        <View style={styles.badges}><Badge value={user.accountStatus} /><Badge value={user.verificationStatus} /></View>
      </Card>
      {user.role === "cliente" ? (
        <>
          <Card><Metric label="Proyectos" value={projectItems.length} /><Text style={styles.muted}>Publica nuevos trabajos y compara propuestas de profesionales verificados.</Text></Card>
          <Card><Text style={styles.title}>Qué puedes hacer desde la app</Text><Bullet text="Publicar y consultar proyectos" /><Bullet text="Comparar propuestas y desbloquear contactos" /><Bullet text="Hablar con soporte y consultar información legal" /></Card>
        </>
      ) : null}
      {user.role === "profesional" ? (
        <>
          <Card><Metric label="Oportunidades compatibles" value={projectItems.length} /><Text style={styles.muted}>Solo se muestran proyectos relacionados con especialidades aprobadas.</Text></Card>
          <Card><Metric label="Facturación" value={billingSummary?.account?.status || "PENDIENTE_MANDATO"} /><Metric label="Saldo vencido" value={money(billingSummary?.account?.overdue_balance_cents)} /></Card>
        </>
      ) : null}
      {user.role === "admin" && admin ? (
        <>
          <Card><Metric label="Usuarios" value={admin.usersTotal} /><Text style={styles.muted}>{admin.clientsTotal} clientes · {admin.professionalsTotal} profesionales</Text></Card>
          <Card><Metric label="Proyectos" value={admin.projectsTotal} /><Metric label="Cuentas suspendidas" value={admin.suspendedAccounts} /></Card>
          <Card><Metric label="Pendientes de verificación" value={admin.pendingQualifications + admin.pendingPortfolios + admin.pendingInsurance} /><Metric label="Saldo vencido" value={money(admin.overdueBalanceCents)} /></Card>
        </>
      ) : null}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return <View style={styles.bullet}><View style={styles.dot} /><Text style={styles.bulletText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  muted: { color: colors.muted, lineHeight: 21 },
  title: { color: colors.primary, fontWeight: "900", fontSize: 18 },
  bullet: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 },
  bulletText: { flex: 1, color: colors.text, lineHeight: 20 },
});
