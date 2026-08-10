import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { adminAudit, adminOverview, adminProjects, adminUsers } from "../api";
import { colors } from "../theme";
import type { AdminOverview } from "../types";
import { Badge, Card, Empty, ErrorNotice, Loading, Metric, SectionTitle, Tabs, money, shortDate } from "../ui";

type AdminTab = "overview" | "users" | "projects" | "audit";

export function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof adminUsers>>["users"]>([]);
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof adminProjects>>["projects"]>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof adminAudit>>["events"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(active: AdminTab) {
    setLoading(true);
    setError("");
    try {
      if (active === "overview") setOverview(await adminOverview());
      if (active === "users") setUsers((await adminUsers()).users);
      if (active === "projects") setProjects((await adminProjects()).projects);
      if (active === "audit") setEvents((await adminAudit()).events);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido cargar el panel de administración.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(tab); }, [tab]);

  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="ADMINISTRACIÓN" title="Centro de control" detail="Usuarios, proyectos, verificaciones, facturación y auditoría desde el móvil." />
      <Tabs items={[
        { id: "overview", label: "Resumen" },
        { id: "users", label: "Usuarios" },
        { id: "projects", label: "Proyectos" },
        { id: "audit", label: "Audit" },
      ]} active={tab} onChange={(id) => setTab(id as AdminTab)} />
      {error ? <ErrorNotice message={error} /> : null}
      {loading ? <Loading label="Cargando panel…" /> : null}
      {!loading && tab === "overview" ? <Overview data={overview} /> : null}
      {!loading && tab === "users" ? <Users items={users} /> : null}
      {!loading && tab === "projects" ? <Projects items={projects} /> : null}
      {!loading && tab === "audit" ? <Audit items={events} /> : null}
    </View>
  );
}

function Overview({ data }: { data: AdminOverview | null }) {
  if (!data) return <Empty title="Sin datos de administración" />;
  const pending = Number(data.pendingQualifications) + Number(data.pendingPortfolios) + Number(data.pendingInsurance);
  return (
    <View style={styles.wrap}>
      <Card><Metric label="Usuarios" value={data.usersTotal} /><Text style={styles.meta}>{data.clientsTotal} clientes · {data.professionalsTotal} profesionales</Text></Card>
      <Card><Metric label="Proyectos" value={data.projectsTotal} /><Text style={styles.meta}>{data.activeProjects} activos</Text></Card>
      <Card><Metric label="Verificaciones pendientes" value={pending} /><Text style={styles.meta}>{data.pendingQualifications} tests · {data.pendingPortfolios} portfolios · {data.pendingInsurance} RC</Text></Card>
      <Card><Metric label="Cuentas suspendidas" value={data.suspendedAccounts} /><Metric label="Saldo vencido" value={money(data.overdueBalanceCents)} /></Card>
    </View>
  );
}

function Users({ items }: { items: Awaited<ReturnType<typeof adminUsers>>["users"] }) {
  if (!items.length) return <Empty title="No hay usuarios" />;
  return <View style={styles.wrap}>{items.map((user) => (
    <Card key={user.id}>
      <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.title}>{user.company_name || user.name}</Text><Text style={styles.meta}>{user.email} · {user.role}</Text></View><Badge value={user.account_status} /></View>
      <Badge value={user.verification_status} />
      <Text style={styles.meta}>Alta: {shortDate(user.created_at)} · Último acceso: {shortDate(user.last_login_at)}</Text>
      {user.billing_status ? <Text style={styles.meta}>Facturación: {user.billing_status} · vencido {money(user.overdue_balance_cents)}</Text> : null}
    </Card>
  ))}</View>;
}

function Projects({ items }: { items: Awaited<ReturnType<typeof adminProjects>>["projects"] }) {
  if (!items.length) return <Empty title="No hay proyectos" />;
  return <View style={styles.wrap}>{items.map((project) => (
    <Card key={project.id}>
      <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.category}>{project.category}</Text><Text style={styles.title}>{project.title}</Text></View><Badge value={project.status} /></View>
      <Text style={styles.meta}>{project.location} · {shortDate(project.created_at)}</Text>
      <Text style={styles.text}>Cliente: {project.owner_name} · {project.owner_email}</Text>
      <Metric label="Presupuesto" value={money(project.budget_cents)} />
      <Text style={styles.meta}>{project.proposal_count} propuestas · {project.shortlist_count} shortlist · contrato {project.has_contract ? "sí" : "no"}</Text>
    </Card>
  ))}</View>;
}

function Audit({ items }: { items: Awaited<ReturnType<typeof adminAudit>>["events"] }) {
  if (!items.length) return <Empty title="No hay eventos de auditoría" />;
  return <View style={styles.wrap}>{items.map((event) => (
    <Card key={String(event.id)}>
      <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.category}>{event.entity_type}</Text><Text style={styles.title}>{event.action}</Text></View><Text style={styles.meta}>#{event.id}</Text></View>
      <Text style={styles.meta}>{event.actor_email || event.actor_name || "Sistema"} · {shortDate(event.created_at)}</Text>
      {event.entity_id ? <Text style={styles.meta}>Entidad: {event.entity_id}</Text> : null}
      {event.ip_address ? <Text style={styles.meta}>IP: {event.ip_address}</Text> : null}
    </Card>
  ))}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start", justifyContent: "space-between" },
  title: { color: colors.primary, fontWeight: "900", fontSize: 17 },
  category: { color: colors.cta, fontWeight: "900", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1 },
  meta: { color: colors.muted, lineHeight: 19, fontSize: 12 },
  text: { color: colors.text, lineHeight: 20 },
});
