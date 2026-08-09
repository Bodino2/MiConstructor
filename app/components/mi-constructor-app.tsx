"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type NavKey = "resumen" | "proyectos" | "profesionales" | "mensajes";

type Project = {
  id: number;
  title: string;
  category: string;
  location: string;
  professional: string;
  avatar: string;
  progress: number;
  budget: number;
  nextMilestone: string;
  nextAmount: number;
  status: "En curso" | "Recibiendo ofertas" | "Finalizado";
};

type Profile = {
  nombre: string;
  email: string;
  tipo: "cliente" | "profesional";
  empresa?: string | null;
  cifDniEnmascarado: string;
};

const initialProjects: Project[] = [
  {
    id: 1,
    title: "Reforma integral · Piso Avenida Europa",
    category: "Reforma integral",
    location: "Madrid",
    professional: "Construcciones Serrano",
    avatar: "CS",
    progress: 64,
    budget: 42500,
    nextMilestone: "Instalaciones y tabiquería",
    nextAmount: 10800,
    status: "En curso",
  },
  {
    id: 2,
    title: "Renovación de cocina · Calle del Prado",
    category: "Cocinas",
    location: "Madrid",
    professional: "Pendiente de asignar",
    avatar: "PR",
    progress: 8,
    budget: 14600,
    nextMilestone: "Selección de profesional",
    nextAmount: 2920,
    status: "Recibiendo ofertas",
  },
];

const demoViewer = {
  name: "María López",
  email: "demo@miconstructor.es",
};

const demoProfile: Profile = {
  nombre: demoViewer.name,
  email: demoViewer.email,
  tipo: "cliente",
  empresa: null,
  cifDniEnmascarado: "••••0000",
};

const euros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function MiConstructorApp() {
  const viewer = demoViewer;
  const [activeNav, setActiveNav] = useState<NavKey>("resumen");
  const [projects, setProjects] = useState(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(demoProfile);
  const busy = false;
  const [formError, setFormError] = useState("");
  const [budgetDraft, setBudgetDraft] = useState(25000);
  const [proposalProjectId, setProposalProjectId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? projects[0];

  const displayName = useMemo(
    () => (profile?.nombre ?? viewer.name).split(" ")[0] || "María",
    [profile, viewer.name],
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function addProject(formData: FormData) {
    const title = String(formData.get("title") || "Nueva reforma");
    const budget = Number(formData.get("budget") || 0);
    const category = String(formData.get("category") || "Reforma integral");
    const location = String(formData.get("location") || "Madrid");
    const description = String(formData.get("description") || "");
    const milestoneAmounts = splitBudget(budget);

    setFormError("");
    const created: Project = {
        id: Math.max(0, ...projects.map((project) => project.id)) + 1,
        title,
        category,
        location,
        professional: "Pendiente de asignar",
        avatar: "PR",
        progress: 0,
        budget,
        nextMilestone: "Preparación y demoliciones",
        nextAmount: milestoneAmounts[0],
        status: "Recibiendo ofertas",
    };
    void description;
    setProjects((current) => [created, ...current]);
    setActiveProjectId(created.id);
    setCreateOpen(false);
    notify("Proyecto añadido a la demo con 4 hitos protegidos.");
  }

  function submitProposal(formData: FormData) {
    if (!proposalProjectId) return;
    setFormError("");
    void formData;
    setProposalProjectId(null);
    notify("Propuesta simulada correctamente en la demo.");
  }

  function toggleDemoRole() {
    const nextRole = profile.tipo === "cliente" ? "profesional" : "cliente";
    setProfile((current) => ({ ...current, tipo: nextRole }));
    setActiveNav("resumen");
    setMobileNav(false);
    notify(nextRole === "cliente" ? "Vista de cliente activada." : "Vista de profesional activada.");
  }

  const navItems: Array<{ key: NavKey; label: string; glyph: string; badge?: string }> = [
    { key: "resumen", label: "Resumen", glyph: "⌂" },
    { key: "proyectos", label: profile?.tipo === "profesional" ? "Oportunidades" : "Mis proyectos", glyph: "▦", badge: String(projects.length) },
    { key: "profesionales", label: "Profesionales", glyph: "◎" },
    { key: "mensajes", label: "Mensajes", glyph: "✉", badge: "3" },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <BrandMark />
          <div>
            <strong>MiConstructor</strong>
            <span>Reformas sin incertidumbre</span>
          </div>
        </div>

        <nav aria-label="Navegación principal">
          <p className="nav-caption">{profile?.tipo === "profesional" ? "ESPACIO PROFESIONAL" : "ESPACIO DE CLIENTE"}</p>
          {navItems.map((item) => (
            <button
              className={activeNav === item.key ? "nav-item active" : "nav-item"}
              key={item.key}
              onClick={() => {
                setActiveNav(item.key);
                setMobileNav(false);
              }}
              type="button"
            >
              <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
              <span>{item.label}</span>
              {item.badge ? <small>{item.badge}</small> : null}
            </button>
          ))}
        </nav>

        <button className="demo-role-switch" type="button" onClick={toggleDemoRole}>
          <span>↔</span>
          <span>
            <small>MODO DEMOSTRACIÓN</small>
            <strong>Ver como {profile.tipo === "cliente" ? "profesional" : "cliente"}</strong>
          </span>
        </button>

        <div className="sidebar-help">
          <span className="help-orbit">?</span>
          <strong>¿Necesitas ayuda?</strong>
          <p>Tu asesor responde en menos de 5 minutos.</p>
          <button type="button" onClick={() => notify("Hemos avisado a tu asesor personal.")}>Hablar con un asesor</button>
        </div>

        <button className="profile-chip" type="button" onClick={() => notify("Estás explorando la versión pública de MiConstructor.")}>
          <span>{(profile?.nombre ?? viewer.name).slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{profile?.nombre ?? viewer.name}</strong>
            <small>{profile.tipo === "cliente" ? "Demo cliente" : "Demo profesional"}</small>
          </div>
          <b>•••</b>
        </button>
        <Link className="back-public-site" href="/">← Volver al sitio público</Link>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button
            className="menu-button"
            type="button"
            aria-label="Abrir navegación"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav((value) => !value)}
          >
            ☰
          </button>
          <div className="crumbs"><span>MiConstructor</span><b>/</b> {navItems.find((item) => item.key === activeNav)?.label}</div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Buscar" onClick={() => notify("La búsqueda estará disponible en todos tus proyectos.")}>⌕</button>
            <button className="icon-button notification" aria-label="Notificaciones" onClick={() => notify("Tienes 2 actualizaciones nuevas.")}>♢<i>2</i></button>
            {profile?.tipo !== "profesional" ? (
              <button className="primary-button compact" type="button" onClick={() => setCreateOpen(true)}>
                <span>＋</span> Nuevo proyecto
              </button>
            ) : null}
          </div>
        </header>

        <div className="content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">DOMINGO, 9 DE AGOSTO</p>
              <h1>Buenos días, {displayName}.</h1>
              <p>{profile?.tipo === "profesional" ? "Nuevas oportunidades verificadas esperan tu propuesta." : "Tus reformas avanzan según lo previsto. Aquí tienes lo importante de hoy."}</p>
            </div>
            <div className="secure-pill"><span>✓</span> Pagos protegidos por hitos</div>
          </section>

          {activeNav === "resumen" ? (
            profile?.tipo === "profesional" ? (
              <ProfessionalDashboard projects={projects} onPropose={setProposalProjectId} />
            ) : activeProject ? (
              <DashboardView
                project={activeProject}
                projects={projects}
                onSelect={setActiveProjectId}
                onNavigate={setActiveNav}
                onNotify={notify}
              />
            ) : (
              <EmptyProjects onCreate={() => setCreateOpen(true)} />
            )
          ) : activeNav === "proyectos" ? (
            profile?.tipo === "profesional" ? (
              <ProfessionalDashboard projects={projects} onPropose={setProposalProjectId} expanded />
            ) : (
              <ProjectsView projects={projects} onCreate={() => setCreateOpen(true)} onSelect={(id) => { setActiveProjectId(id); setActiveNav("resumen"); }} />
            )
          ) : activeNav === "profesionales" ? (
            <ProfessionalsView onNotify={notify} />
          ) : (
            <MessagesView onNotify={notify} />
          )}
        </div>
      </main>

      {createOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreateOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="modal-kicker">NUEVO PROYECTO</span>
                <h2 id="new-project-title">Cuéntanos qué quieres construir</h2>
                <p>El presupuesto se dividirá en cuatro hitos verificables.</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <form action={addProject}>
              <label>
                Nombre del proyecto
                <input name="title" required placeholder="Ej. Reforma integral · Piso Gran Vía" />
              </label>
              <div className="form-grid">
                <label>
                  Tipo de obra
                  <select name="category" defaultValue="Reforma integral">
                    <option>Reforma integral</option>
                    <option>Cocinas</option>
                    <option>Baños</option>
                    <option>Obra nueva</option>
                    <option>Instalaciones</option>
                  </select>
                </label>
                <label>
                  Ciudad
                  <input name="location" required placeholder="Madrid" />
                </label>
              </div>
              <label>
                Descripción de la obra
                <textarea name="description" required minLength={30} placeholder="Describe el estado actual, los trabajos necesarios y el resultado esperado…" />
              </label>
              <label>
                Presupuesto máximo
                <div className="money-input"><input name="budget" type="number" min="1000" step="100" required value={budgetDraft} onChange={(event) => setBudgetDraft(Number(event.target.value))} /><span>EUR</span></div>
              </label>
              <div className="milestone-plan">
                {[
                  ["Preparación", 20],
                  ["Instalaciones", 30],
                  ["Acabados", 35],
                  ["Entrega", 15],
                ].map(([label, percent], index) => (
                  <span key={String(label)}><i>{index + 1}</i><b>{label}</b><small>{percent}% · {euros.format(splitBudget(budgetDraft)[index])}</small></span>
                ))}
              </div>
              <label className="consent-row">
                <input type="checkbox" required />
                <span>Confirmo que la información es correcta y acepto las condiciones de publicación.</span>
              </label>
              <div className="modal-actions">
                {formError ? <p className="form-error">{formError}</p> : null}
                <button className="secondary-button" type="button" onClick={() => setCreateOpen(false)}>Cancelar</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? "Publicando…" : "Crear proyecto"} <span>→</span></button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {proposalProjectId ? (
        <ProposalModal
          project={projects.find((project) => project.id === proposalProjectId)}
          busy={busy}
          error={formError}
          onClose={() => { setProposalProjectId(null); setFormError(""); }}
          onSubmit={submitProposal}
        />
      ) : null}

      {toast ? <div className="toast" role="status"><span>✓</span>{toast}</div> : null}
      {mobileNav ? <button className="mobile-scrim" aria-label="Cerrar navegación" onClick={() => setMobileNav(false)} /> : null}
    </div>
  );
}

function splitBudget(budget: number) {
  const cents = Math.max(0, Math.round((Number.isFinite(budget) ? budget : 0) * 100));
  const first = Math.round(cents * 0.2);
  const second = Math.round(cents * 0.3);
  const third = Math.round(cents * 0.35);
  const fourth = cents - first - second - third;
  return [first, second, third, fourth].map((amount) => amount / 100);
}

function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state panel">
      <div className="empty-blueprint" aria-hidden="true">
        <span>＋</span><i /><i /><i />
      </div>
      <span className="modal-kicker">TU PRIMERA REFORMA</span>
      <h2>Crea un proyecto seguro, de principio a fin</h2>
      <p>
        Define el trabajo y el presupuesto. MiConstructor lo divide por hitos,
        para que cada avance se revise antes de liberar fondos.
      </p>
      <button className="primary-button" type="button" onClick={onCreate}>
        ＋ Crear mi primer proyecto
      </button>
      <div className="empty-features">
        <span><b>01</b> Publica la obra</span>
        <span><b>02</b> Compara profesionales</span>
        <span><b>03</b> Aprueba cada hito</span>
      </div>
    </section>
  );
}

function ProfessionalDashboard({
  projects,
  onPropose,
  expanded = false,
}: {
  projects: Project[];
  onPropose: (id: number) => void;
  expanded?: boolean;
}) {
  return (
    <section className="marketplace-view">
      <div className="market-hero">
        <div>
          <span>OPORTUNIDADES VERIFICADAS</span>
          <h2>{expanded ? "Proyectos disponibles" : "Trabajos que encajan contigo"}</h2>
          <p>Clientes identificados, alcance definido y presupuesto protegido por hitos.</p>
        </div>
        <div className="market-score"><strong>92%</strong><span>compatibilidad media</span></div>
      </div>
      <div className="market-filters">
        <button className="active">Todos</button><button>Reforma integral</button><button>Cocinas</button><button>Madrid</button>
        <span>{projects.length} oportunidades</span>
      </div>
      {projects.length ? (
        <div className="opportunity-list">
          {projects.map((project) => (
            <article className="panel opportunity-card" key={project.id}>
              <div className="opportunity-main">
                <div className="list-head"><span>{project.category.slice(0, 2).toUpperCase()}</span><small className="status-live">CLIENTE VERIFICADO</small></div>
                <p>{project.category} · {project.location}</p>
                <h3>{project.title}</h3>
                <div className="opportunity-tags"><span>◎ {project.location}</span><span>▦ 4 hitos</span><span>◴ Publicado recientemente</span></div>
              </div>
              <div className="opportunity-offer">
                <small>PRESUPUESTO DEL CLIENTE</small>
                <strong>{euros.format(project.budget)}</strong>
                <p>Fondos por hitos · Sin comisión en esta demo</p>
                <button className="primary-button" onClick={() => onPropose(project.id)}>Enviar propuesta →</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="market-empty panel"><span>⌕</span><h3>No hay obras abiertas ahora mismo</h3><p>Te avisaremos cuando aparezca un proyecto compatible.</p></div>
      )}
    </section>
  );
}

function ProposalModal({
  project,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  project?: Project;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  if (!project) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="proposal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="modal-kicker">PROPUESTA PROFESIONAL</span><h2 id="proposal-title">{project.title}</h2><p>{project.location} · Presupuesto orientativo {euros.format(project.budget)}</p></div>
          <button type="button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <form action={onSubmit}>
          <div className="form-grid">
            <label>Tu presupuesto<div className="money-input"><input name="amount" type="number" min="1000" step="100" defaultValue={project.budget} required /><span>EUR</span></div></label>
            <label>Plazo estimado<input name="days" type="number" min="1" max="730" defaultValue="60" required /></label>
          </div>
          <label>Mensaje al cliente<textarea name="message" minLength={20} required placeholder="Explica tu experiencia, disponibilidad y cómo abordarías el proyecto…" /></label>
          {error ? <p className="form-error standalone">{error}</p> : null}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Enviando…" : "Enviar propuesta →"}</button></div>
        </form>
      </section>
    </div>
  );
}

function DashboardView({
  project,
  projects,
  onSelect,
  onNavigate,
  onNotify,
}: {
  project: Project;
  projects: Project[];
  onSelect: (id: number) => void;
  onNavigate: (key: NavKey) => void;
  onNotify: (message: string) => void;
}) {
  return (
    <>
      <section className="project-switcher" aria-label="Selector de proyecto">
        <div>
          <span className="project-badge">{project.category.slice(0, 2).toUpperCase()}</span>
          <div>
            <small>PROYECTO ACTIVO</small>
            <select value={project.id} onChange={(event) => onSelect(Number(event.target.value))} aria-label="Proyecto activo">
              {projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
            </select>
            <p>Madrid · REF-{String(project.id).padStart(4, "0")} · <span>{project.status}</span></p>
          </div>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("proyectos")}>Ver detalles <span>→</span></button>
      </section>

      <section className="metrics-grid">
        <article className="metric-card accent-blue">
          <div className="metric-icon">◴</div>
          <div><p>Progreso general</p><strong>{project.progress}%</strong></div>
          <span className="metric-trend positive">↑ 8% este mes</span>
          <div className="mini-progress"><i style={{ width: `${project.progress}%` }} /></div>
        </article>
        <article className="metric-card accent-orange">
          <div className="metric-icon">€</div>
          <div><p>Presupuesto utilizado</p><strong>{euros.format(Math.round(project.budget * (project.progress / 100)))}</strong></div>
          <span className="metric-sub">de {euros.format(project.budget)}</span>
          <div className="mini-progress orange"><i style={{ width: `${Math.min(project.progress, 100)}%` }} /></div>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-icon">✓</div>
          <div><p>Hitos completados</p><strong>{Math.max(1, Math.round(project.progress / 22))} <small>de 5</small></strong></div>
          <span className="metric-sub">Siguiente revisión en 4 días</span>
        </article>
        <article className="metric-card accent-purple">
          <div className="metric-icon">✦</div>
          <div><p>Próxima acción</p><strong className="action-title">Validar avance</strong></div>
          <button onClick={() => onNotify("Revisión abierta. Comprueba fotos y documentación.")}>Revisar hito <span>→</span></button>
        </article>
      </section>

      <section className="main-grid">
        <article className="panel progress-panel">
          <div className="panel-heading">
            <div><h2>Progreso de la obra</h2><p>Plan de ejecución y liberación segura de fondos</p></div>
            <span className="updated"><i /> Actualizado hoy, 09:42</span>
          </div>
          <div className="timeline">
            <Milestone state="done" index="01" title="Demoliciones y retirada" meta="Finalizado el 18 jun" amount="5.500 €" />
            <Milestone state="done" index="02" title="Albañilería y distribución" meta="Finalizado el 12 jul" amount="8.250 €" />
            <Milestone state="active" index="03" title={project.nextMilestone} meta="En ejecución · 72% completado" amount={euros.format(project.nextAmount)} onClick={() => onNotify("Documentación del hito abierta para revisión.")} />
            <Milestone state="future" index="04" title="Revestimientos y acabados" meta="Inicio previsto: 18 ago" amount="9.650 €" />
            <Milestone state="future" index="05" title="Entrega y certificación final" meta="Inicio previsto: 2 sep" amount="8.300 €" />
          </div>
        </article>

        <aside className="side-stack">
          <article className="panel professional-card">
            <div className="panel-heading"><div><h2>Tu profesional</h2><p>Responsable de la ejecución</p></div><span className="verified">✓ Verificado</span></div>
            <div className="professional-profile">
              <span>{project.avatar}</span>
              <div><strong>{project.professional}</strong><p>Empresa de reformas · Madrid</p><small><b>★ 4,9</b> · 127 valoraciones</small></div>
            </div>
            <div className="professional-stats"><span><b>12</b>años de experiencia</span><span><b>94</b>proyectos finalizados</span></div>
            <div className="professional-actions"><button onClick={() => onNotify("Conversación abierta con Construcciones Serrano.")}>✉ Enviar mensaje</button><button aria-label="Llamar" onClick={() => onNotify("Teléfono verificado: +34 910 000 000")}>⌕</button></div>
          </article>

          <article className="panel payment-card">
            <div className="escrow-visual"><span>€</span><i>✓</i></div>
            <div className="payment-copy"><small>FONDOS PROTEGIDOS</small><strong>{euros.format(project.nextAmount)}</strong><p>Reservados para el hito actual. Solo se liberan tras tu aprobación.</p></div>
            <button onClick={() => onNotify("Todos los movimientos están disponibles en el historial.")}>Ver movimientos <span>→</span></button>
            <p className="simulation-note">Demostración de escrow: no se procesan pagos reales.</p>
          </article>
        </aside>
      </section>

      <section className="activity-panel panel">
        <div className="panel-heading"><div><h2>Actividad reciente</h2><p>Últimos movimientos del proyecto</p></div><button onClick={() => onNotify("Historial completo preparado.")}>Ver toda la actividad</button></div>
        <div className="activity-row"><span className="activity-icon photo">▧</span><div><strong>8 fotos nuevas añadidas</strong><p>Construcciones Serrano · Hito 03</p></div><time>Hace 2 horas</time></div>
        <div className="activity-row"><span className="activity-icon doc">≡</span><div><strong>Certificación de instalaciones subida</strong><p>Documento PDF · 2,4 MB</p></div><time>Ayer, 18:24</time></div>
        <div className="activity-row"><span className="activity-icon check">✓</span><div><strong>Hito 02 aprobado y pagado</strong><p>Pago liberado · 8.250 €</p></div><time>12 jul, 10:16</time></div>
      </section>
    </>
  );
}

function Milestone({ state, index, title, meta, amount, onClick }: { state: "done" | "active" | "future"; index: string; title: string; meta: string; amount: string; onClick?: () => void }) {
  return (
    <button className={`milestone ${state}`} type="button" onClick={onClick} disabled={!onClick}>
      <span className="milestone-index">{state === "done" ? "✓" : index}</span>
      <div><strong>{title}</strong><p>{meta}</p>{state === "active" ? <span className="stage-progress"><i /></span> : null}</div>
      <b>{amount}</b>
      <em>{state === "done" ? "LIBERADO" : state === "active" ? "EN ESCROW" : "PREVISTO"}</em>
    </button>
  );
}

function ProjectsView({ projects, onCreate, onSelect }: { projects: Project[]; onCreate: () => void; onSelect: (id: number) => void }) {
  return (
    <section className="listing-view">
      <div className="section-title"><div><span>GESTIÓN DE OBRAS</span><h1>Mis proyectos</h1><p>Consulta el progreso, presupuesto y profesional de cada reforma.</p></div><button className="primary-button" onClick={onCreate}>＋ Nuevo proyecto</button></div>
      <div className="project-list">
        {projects.map((project) => (
          <article key={project.id}>
            <div className="list-head"><span>{project.category.slice(0, 2).toUpperCase()}</span><small className={project.status === "En curso" ? "status-live" : "status-offers"}>{project.status}</small></div>
            <div><p>{project.category} · {project.location}</p><h2>{project.title}</h2><span className="assigned">{project.avatar} {project.professional}</span></div>
            <div className="project-list-progress"><span><b>{project.progress}%</b> completado</span><i><b style={{ width: `${project.progress}%` }} /></i></div>
            <footer><strong>{euros.format(project.budget)}</strong><button onClick={() => onSelect(project.id)}>Abrir proyecto →</button></footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfessionalsView({ onNotify }: { onNotify: (message: string) => void }) {
  const professionals = [
    ["AS", "Arquitectura Sol", "Arquitectura y dirección de obra", "4,9", "Madrid"],
    ["CR", "Construcciones Rivas", "Reformas integrales", "4,8", "Madrid y Toledo"],
    ["EB", "EcoBuild Studio", "Eficiencia energética", "4,9", "Comunidad de Madrid"],
  ];
  return (
    <section className="listing-view">
      <div className="section-title"><div><span>RED VERIFICADA</span><h1>Profesionales</h1><p>Compara experiencia, valoraciones y especialidades.</p></div><button className="secondary-button" onClick={() => onNotify("Filtros activados.")}>Filtros</button></div>
      <div className="professional-grid">
        {professionals.map(([avatar, name, specialty, rating, area]) => (
          <article className="panel directory-card" key={name}>
            <div className="directory-avatar">{avatar}<i>✓</i></div><small>PROFESIONAL VERIFICADO</small><h2>{name}</h2><p>{specialty}</p><div><span>★ {rating}</span><span>◎ {area}</span></div><button onClick={() => onNotify(`Perfil de ${name} abierto.`)}>Ver perfil completo</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function MessagesView({ onNotify }: { onNotify: (message: string) => void }) {
  return (
    <section className="messages-view panel">
      <aside><div><span className="message-avatar">CS</span><div><strong>Construcciones Serrano</strong><p>He subido las fotos de hoy.</p></div><time>09:42</time></div><div><span className="message-avatar orange">AS</span><div><strong>Arquitectura Sol</strong><p>Presupuesto disponible.</p></div><time>Ayer</time></div></aside>
      <div className="conversation"><header><span className="message-avatar">CS</span><div><strong>Construcciones Serrano</strong><p><i /> En obra ahora</p></div></header><div className="chat"><p className="received">Buenos días, María. Hemos terminado la instalación eléctrica del salón.</p><p className="received">He subido las fotos y el certificado para que puedas revisarlo.</p><p className="sent">Perfecto, lo reviso esta tarde. ¡Gracias!</p></div><form onSubmit={(event) => { event.preventDefault(); onNotify("Mensaje enviado."); }}><input aria-label="Mensaje" placeholder="Escribe un mensaje…" /><button>Enviar</button></form></div>
    </section>
  );
}
