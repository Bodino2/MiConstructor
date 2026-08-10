import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { createProject, projectDetails, projects as loadProjects, shortlist } from "../api";
import { colors } from "../theme";
import type { Project } from "../types";
import { ActionButton, Badge, Card, Empty, ErrorNotice, Field, Loading, Metric, SectionTitle, money, shortDate } from "../ui";

export function ClientProjectsScreen() {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const result = await loadProjects();
      setItems(result.projects);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se han podido cargar los proyectos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function openProject(project: Project) {
    setLoading(true);
    setError("");
    try {
      const result = await projectDetails(project.id);
      setSelected(result.project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido abrir el proyecto.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading label="Cargando proyectos…" />;
  if (creating) return <CreateProjectForm onCancel={() => setCreating(false)} onCreated={async () => { setCreating(false); await refresh(); }} />;
  if (selected) return <ProjectDetail project={selected} onBack={() => setSelected(null)} onRefresh={() => openProject(selected)} />;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <SectionTitle eyebrow="ÁREA CLIENTE" title="Tus proyectos" detail="Publica, compara propuestas y desbloquea al profesional seleccionado." />
        <ActionButton label="Nuevo proyecto" onPress={() => setCreating(true)} />
      </View>
      {error ? <ErrorNotice message={error} /> : null}
      {!items.length ? <Empty title="No hay proyectos todavía" detail="Publica el primero para empezar a recibir propuestas." /> : items.map((project) => (
        <Pressable key={project.id} onPress={() => void openProject(project)}>
          <Card>
            <View style={styles.rowBetween}><Text style={styles.category}>{project.category}</Text><Badge value={project.status} /></View>
            <Text style={styles.title}>{project.title}</Text>
            <Text style={styles.description} numberOfLines={3}>{project.description}</Text>
            <View style={styles.rowBetween}><Text style={styles.meta}>{project.location} · {shortDate(project.created_at)}</Text><Text style={styles.amount}>{money(project.budget_cents ?? project.budgetCents)}</Text></View>
          </Card>
        </Pressable>
      ))}
      <ActionButton label="Actualizar" variant="ghost" onPress={() => void refresh()} />
    </View>
  );
}

function ProjectDetail({ project, onBack, onRefresh }: { project: Project; onBack: () => void; onRefresh: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const proposals = project.proposals || [];

  async function choose(professionalId: string) {
    setBusyId(professionalId);
    setError("");
    try {
      const result = await shortlist(project.id, professionalId);
      const contact = [result.contact.email, result.contact.phone].filter(Boolean).join(" · ");
      Alert.alert("Contacto desbloqueado", contact || "Profesional seleccionado.");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido seleccionar al profesional.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <View style={styles.wrap}>
      <ActionButton label="← Volver a proyectos" variant="ghost" onPress={onBack} />
      <Card>
        <View style={styles.rowBetween}><Text style={styles.category}>{project.category}</Text><Badge value={project.status} /></View>
        <Text style={styles.title}>{project.title}</Text>
        <Text style={styles.description}>{project.description}</Text>
        <Metric label="Presupuesto estimado" value={money(project.budget_cents ?? project.budgetCents)} />
        <Text style={styles.meta}>{project.location}</Text>
      </Card>
      <SectionTitle eyebrow="PROPUESTAS" title={`${proposals.length} recibida(s)`} />
      {error ? <ErrorNotice message={error} /> : null}
      {!proposals.length ? <Empty title="Todavía no hay propuestas" detail="Te avisaremos cuando un profesional verificado envíe una oferta." /> : proposals.map((proposal) => (
        <Card key={proposal.id}>
          <View style={styles.rowBetween}><Text style={styles.proName}>{proposal.company_name || proposal.name || "Profesional"}</Text><Text style={styles.amount}>{money(proposal.amount_cents)}</Text></View>
          <Text style={styles.meta}>★ {proposal.rating || 0} · {proposal.review_count || 0} reseñas · {proposal.insured ? "RC verificada" : "RC no verificada"}</Text>
          <Text style={styles.description}>{proposal.message}</Text>
          <Text style={styles.meta}>{proposal.estimated_days} días estimados</Text>
          <ActionButton label={busyId === proposal.professional_id ? "Seleccionando…" : "Seleccionar y desbloquear contacto"} disabled={Boolean(busyId)} onPress={() => void choose(proposal.professional_id)} />
        </Card>
      ))}
    </View>
  );
}

function CreateProjectForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [squareMeters, setSquareMeters] = useState("");
  const [budgetEuros, setBudgetEuros] = useState("");
  const [category, setCategory] = useState("reformas_integrales");
  const [projectType, setProjectType] = useState("reforma_integral");
  const [qualityLevel, setQualityLevel] = useState("estandar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        category,
        projectType,
        location: location.trim(),
        squareMeters: Number(squareMeters),
        qualityLevel,
      };
      if (budgetEuros.trim()) payload.budgetCents = Math.round(Number(budgetEuros) * 100);
      await createProject(payload);
      Alert.alert("Proyecto publicado", "Ya puede recibir propuestas de profesionales compatibles.");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido publicar el proyecto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <ActionButton label="← Cancelar" variant="ghost" onPress={onCancel} />
      <Card>
        <SectionTitle eyebrow="NUEVO PROYECTO" title="Describe la obra" detail="La plataforma validará el presupuesto frente al estimador de mercado." />
        {error ? <ErrorNotice message={error} /> : null}
        <Field label="Título" value={title} onChangeText={setTitle} />
        <Field label="Localidad" value={location} onChangeText={setLocation} />
        <Field label="Superficie (m²)" value={squareMeters} onChangeText={setSquareMeters} keyboardType="decimal-pad" />
        <Field label="Presupuesto estimado (€) · opcional" value={budgetEuros} onChangeText={setBudgetEuros} keyboardType="decimal-pad" />
        <Text style={styles.label}>Especialidad principal</Text>
        <ChoiceSet value={category} onChange={setCategory} options={[
          ["reformas_integrales", "Reformas integrales"], ["albanileria", "Albañilería"], ["electricidad", "Electricidad"], ["fontaneria", "Fontanería"], ["climatizacion", "Climatización"], ["pintura", "Pintura"],
        ]} />
        <Text style={styles.label}>Tipo de proyecto</Text>
        <ChoiceSet value={projectType} onChange={setProjectType} options={[["bano", "Baño"], ["cocina", "Cocina"], ["reforma_integral", "Reforma integral"], ["construccion_casa", "Construcción de casa"]]} />
        <Text style={styles.label}>Calidad</Text>
        <ChoiceSet value={qualityLevel} onChange={setQualityLevel} options={[["basico", "Básico"], ["estandar", "Estándar"], ["premium", "Premium"]]} />
        <Field label="Descripción detallada" value={description} onChangeText={setDescription} multiline />
        <ActionButton label={busy ? "Publicando…" : "Publicar proyecto"} disabled={busy || title.trim().length < 5 || description.trim().length < 30 || !location.trim() || Number(squareMeters) <= 0} onPress={() => void submit()} />
      </Card>
    </View>
  );
}

function ChoiceSet({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <View style={styles.choices}>{options.map(([id, label]) => <Pressable key={id} onPress={() => onChange(id)} style={[styles.choice, value === id ? styles.choiceActive : null]}><Text style={[styles.choiceText, value === id ? styles.choiceTextActive : null]}>{label}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  headerRow: { gap: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  category: { color: colors.cta, fontWeight: "900", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", flex: 1 },
  title: { color: colors.primary, fontSize: 21, fontWeight: "900", letterSpacing: -0.4 },
  description: { color: colors.muted, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  amount: { color: colors.primary, fontSize: 19, fontWeight: "900" },
  proName: { flex: 1, color: colors.primary, fontWeight: "900", fontSize: 17 },
  label: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: "white" },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.primary, fontWeight: "800" },
  choiceTextActive: { color: "white" },
});
