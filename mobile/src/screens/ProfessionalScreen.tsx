import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL, billing as loadBilling, projects as loadProjects, submitProposal } from "../api";
import { colors } from "../theme";
import type { BillingSummary, Project } from "../types";
import { ActionButton, Badge, Card, Empty, ErrorNotice, Field, Loading, Metric, SectionTitle, money, shortDate } from "../ui";

export function ProfessionalOpportunitiesScreen() {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await loadProjects();
      setItems(result.projects);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se han podido cargar las oportunidades.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  if (loading) return <Loading label="Buscando proyectos compatibles…" />;
  if (selected) return <ProposalForm project={selected} onCancel={() => setSelected(null)} onSent={async () => { setSelected(null); await refresh(); }} />;

  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="ÁREA PROFESIONAL" title="Oportunidades" detail="Solo aparecen proyectos compatibles con especialidades aprobadas." />
      {error ? <ErrorNotice message={error} /> : null}
      {!items.length ? <Empty title="No hay proyectos compatibles" detail="Cuando aparezcan proyectos de tu especialidad aprobada se mostrarán aquí." /> : items.map((project) => (
        <Card key={project.id}>
          <View style={styles.rowBetween}><Text style={styles.category}>{project.category}</Text><Badge value={project.status} /></View>
          <Text style={styles.title}>{project.title}</Text>
          <Text style={styles.description} numberOfLines={4}>{project.description}</Text>
          <View style={styles.rowBetween}><Text style={styles.meta}>{project.location} · {shortDate(project.created_at)}</Text><Text style={styles.amount}>{money(project.budget_cents ?? project.budgetCents)}</Text></View>
          {project.already_applied ? <Badge value="PROPUESTA ENVIADA" /> : <ActionButton label="Enviar propuesta" onPress={() => setSelected(project)} />}
        </Card>
      ))}
      <ActionButton label="Actualizar" variant="ghost" onPress={() => void refresh()} />
    </View>
  );
}

function ProposalForm({ project, onCancel, onSent }: { project: Project; onCancel: () => void; onSent: () => Promise<void> }) {
  const [amountEuros, setAmountEuros] = useState("");
  const [days, setDays] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await submitProposal({
        projectId: project.id,
        amountCents: Math.round(Number(amountEuros) * 100),
        estimatedDays: Number(days),
        message: message.trim(),
      });
      Alert.alert("Propuesta enviada", "El cliente podrá comparar tu propuesta desde MiConstructor.");
      await onSent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido enviar la propuesta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <ActionButton label="← Cancelar" variant="ghost" onPress={onCancel} />
      <Card>
        <SectionTitle eyebrow="PROPUESTA" title={project.title} detail={`${project.location} · presupuesto orientativo ${money(project.budget_cents ?? project.budgetCents)}`} />
        {error ? <ErrorNotice message={error} /> : null}
        <Field label="Importe total (€)" value={amountEuros} onChangeText={setAmountEuros} keyboardType="decimal-pad" />
        <Field label="Plazo estimado (días)" value={days} onChangeText={setDays} keyboardType="number-pad" />
        <Field label="Alcance, materiales, exclusiones y garantías" value={message} onChangeText={setMessage} multiline />
        <ActionButton label={busy ? "Enviando…" : "Enviar propuesta"} disabled={busy || Number(amountEuros) <= 0 || Number(days) <= 0 || message.trim().length < 30} onPress={() => void submit()} />
      </Card>
    </View>
  );
}

export function ProfessionalBillingScreen() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setSummary(await loadBilling());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido cargar la facturación.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  if (loading) return <Loading label="Cargando facturación…" />;
  if (!summary) return <ErrorNotice message={error || "Facturación no disponible."} />;
  const account = summary.account;

  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="FACTURACIÓN" title="Cuenta profesional" detail="Seguimiento de domiciliación, conceptos pendientes y facturas." />
      {error ? <ErrorNotice message={error} /> : null}
      <Card>
        <View style={styles.rowBetween}><Text style={styles.title}>Domiciliación SEPA</Text><Badge value={account?.status || "PENDIENTE_MANDATO"} /></View>
        <Metric label="Saldo vencido" value={money(account?.overdue_balance_cents)} />
        <Text style={styles.description}>La activación y firma del mandato SEPA se completa en el entorno seguro de MiConstructor. La app mostrará automáticamente el estado confirmado por Stripe.</Text>
        {account?.status === "PENDIENTE_MANDATO" ? <ActionButton label="Configurar SEPA" onPress={() => void Linking.openURL(`${API_BASE_URL}/panel`)} /> : null}
      </Card>
      <SectionTitle title="Conceptos pendientes" />
      {!summary.pendingItems.length ? <Empty title="Sin conceptos pendientes" /> : summary.pendingItems.map((item) => <Card key={item.id}><Metric label={`${item.description} · ${shortDate(item.service_date)}`} value={money(item.amount_cents)} /></Card>)}
      <SectionTitle title="Facturas" />
      {!summary.invoices.length ? <Empty title="Todavía no hay facturas" /> : summary.invoices.map((invoice) => <Card key={invoice.id}><View style={styles.rowBetween}><Text style={styles.meta}>{shortDate(invoice.period_start)} – {shortDate(invoice.period_end)}</Text><Badge value={invoice.status} /></View><Text style={styles.amount}>{money(invoice.total_cents)}</Text>{invoice.failure_reason ? <Text style={styles.failure}>{invoice.failure_reason}</Text> : null}</Card>)}
      <ActionButton label="Actualizar" variant="ghost" onPress={() => void refresh()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  category: { color: colors.cta, fontWeight: "900", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", flex: 1 },
  title: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  description: { color: colors.muted, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  amount: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  failure: { color: colors.danger, lineHeight: 20 },
});
