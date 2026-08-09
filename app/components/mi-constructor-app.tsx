"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandMark as MiConstructorMark } from "./brand-logo";
import {
  estimateProjectPrice,
  PROJECT_TYPES,
  QUALITY_LEVELS,
} from "@/lib/project-estimator";

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

type AssessmentQuestion = {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
};

type PublicAssessment = {
  specialty: { slug: string; label: string };
  version: string;
  passScore: number;
  questionCount: number;
  questions: AssessmentQuestion[];
};

const PROFESSIONAL_SPECIALTIES = [
  { slug: "reformas_integrales", label: "Reformas integrales" },
  { slug: "albanileria", label: "Albañilería" },
  { slug: "electricidad", label: "Electricidad" },
  { slug: "fontaneria", label: "Fontanería" },
  { slug: "climatizacion", label: "Climatización" },
  { slug: "pintura", label: "Pintura y revestimientos" },
];

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
    <span className="brand-logo-mark" aria-hidden="true">
      <MiConstructorMark />
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
  const [estimatorType, setEstimatorType] = useState("reforma_integral");
  const [estimatorArea, setEstimatorArea] = useState(70);
  const [estimatorQuality, setEstimatorQuality] = useState("estandar");
  const [proposalProjectId, setProposalProjectId] = useState<number | null>(null);
  const [professionalOnboardingOpen, setProfessionalOnboardingOpen] = useState(false);
  const [professionalPreview, setProfessionalPreview] = useState<string | null>(null);
  const [portfolioUploadOpen, setPortfolioUploadOpen] = useState(false);
  const [evidenceUploadOpen, setEvidenceUploadOpen] = useState(false);
  const [insuranceUploadOpen, setInsuranceUploadOpen] = useState(false);
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("registro") === "profesional") {
      const frame = window.requestAnimationFrame(() => {
        setProfile((current) => ({ ...current, tipo: "profesional" }));
        setProfessionalOnboardingOpen(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? projects[0];

  const displayName = useMemo(
    () => (profile?.nombre ?? viewer.name).split(" ")[0] || "María",
    [profile, viewer.name],
  );

  const projectEstimate = useMemo(
    () => estimateProjectPrice({
      projectType: estimatorType,
      squareMeters: estimatorArea,
      qualityLevel: estimatorQuality,
    }),
    [estimatorArea, estimatorQuality, estimatorType],
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function addProject(formData: FormData) {
    const title = String(formData.get("title") || "Nueva reforma");
    const budget = Number(formData.get("budget") || 0);
    const category = PROJECT_TYPES[String(formData.get("category"))]?.label ?? "Reforma integral";
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

  function closeProfessionalOnboarding() {
    setProfessionalOnboardingOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("registro");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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
              <ProfessionalDashboard
                projects={projects}
                onPropose={setProposalProjectId}
                onShowVerification={() => setProfessionalOnboardingOpen(true)}
                onPortfolio={() => setPortfolioUploadOpen(true)}
                onEvidence={() => setEvidenceUploadOpen(true)}
                onInsurance={() => setInsuranceUploadOpen(true)}
              />
            ) : activeProject ? (
              <DashboardView
                project={activeProject}
                projects={projects}
                onSelect={setActiveProjectId}
                onNavigate={setActiveNav}
                onNotify={notify}
                onInspectProfessional={setProfessionalPreview}
                onOpenContract={() => setContractPreviewOpen(true)}
              />
            ) : (
              <EmptyProjects onCreate={() => setCreateOpen(true)} />
            )
          ) : activeNav === "proyectos" ? (
            profile?.tipo === "profesional" ? (
              <ProfessionalDashboard
                projects={projects}
                onPropose={setProposalProjectId}
                onShowVerification={() => setProfessionalOnboardingOpen(true)}
                onPortfolio={() => setPortfolioUploadOpen(true)}
                onEvidence={() => setEvidenceUploadOpen(true)}
                onInsurance={() => setInsuranceUploadOpen(true)}
                expanded
              />
            ) : (
              <ProjectsView projects={projects} onCreate={() => setCreateOpen(true)} onSelect={(id) => { setActiveProjectId(id); setActiveNav("resumen"); }} />
            )
          ) : activeNav === "profesionales" ? (
            <ProfessionalsView onNotify={notify} onInspect={setProfessionalPreview} />
          ) : (
            <MessagesView onNotify={notify} />
          )}
        </div>
      </main>

      {createOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreateOpen(false)}>
          <section className="modal project-create-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="modal-kicker">NUEVO PROYECTO</span>
                <h2 id="new-project-title">Cuéntanos qué quieres construir</h2>
                <p>Obtén una referencia de mercado antes de publicar y recibir ofertas.</p>
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
                  <select name="category" value={estimatorType} onChange={(event) => setEstimatorType(event.target.value)}>
                    {Object.entries(PROJECT_TYPES).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
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
              <section className="budget-estimator" aria-labelledby="budget-estimator-title">
                <div className="budget-estimator-head">
                  <div><span>ESTIMADOR DE PRESUPUESTO</span><h3 id="budget-estimator-title">Conoce el rango antes de publicar</h3></div>
                  <small>Estimación orientativa · IVA estimado incluido</small>
                </div>
                <p>Te ayudamos a entender los costes de mercado antes de recibir ofertas. El precio final depende de las condiciones reales de la obra.</p>
                <div className="estimator-inputs">
                  <label>Superficie<div className="money-input"><input type="number" min="1" max="1000" step="1" value={estimatorArea} onChange={(event) => setEstimatorArea(Number(event.target.value))} /><span>m²</span></div></label>
                  <label>Nivel de calidades<select value={estimatorQuality} onChange={(event) => setEstimatorQuality(event.target.value)}>{Object.entries(QUALITY_LEVELS).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}</select></label>
                </div>
                {projectEstimate.valid ? (
                  <div className="estimator-result" aria-live="polite">
                    <div className="estimator-range"><small>ESTIMACIÓN ORIENTATIVA DE MERCADO</small><strong>{euros.format(projectEstimate.range.minimum)} – {euros.format(projectEstimate.range.maximum)}</strong><span>{projectEstimate.input.projectTypeLabel} · {projectEstimate.input.squareMeters} m² · {projectEstimate.input.qualityLabel}</span></div>
                    <div className="estimator-breakdown">
                      {Object.values(projectEstimate.breakdown).map((item) => <span key={item.label}><i style={{ width: `${item.share * 100}%` }} /><b>{item.label}</b><small>{euros.format(item.minimum)} – {euros.format(item.maximum)}</small></span>)}
                    </div>
                    <button type="button" onClick={() => setBudgetDraft(Math.round((projectEstimate.range.minimum + projectEstimate.range.maximum) / 200) * 100)}>Usar el punto medio como presupuesto</button>
                  </div>
                ) : <p className="form-error standalone">Introduce una superficie válida entre 1 y 1.000 m².</p>}
                <small className="estimator-note">Esta simulación no sustituye una medición técnica. Los profesionales verificados enviarán presupuestos exactos después de revisar el proyecto.</small>
              </section>
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

      {professionalOnboardingOpen ? (
        <ProfessionalOnboardingModal onClose={closeProfessionalOnboarding} />
      ) : null}

      {professionalPreview ? <ProfessionalProofModal name={professionalPreview} onClose={() => setProfessionalPreview(null)} /> : null}
      {portfolioUploadOpen ? <PortfolioUploadModal onClose={() => setPortfolioUploadOpen(false)} onSaved={() => { setPortfolioUploadOpen(false); notify("Trabajo enviado a moderación con fotos de antes y después."); }} /> : null}
      {evidenceUploadOpen ? <EvidenceUploadModal onClose={() => setEvidenceUploadOpen(false)} onSaved={() => { setEvidenceUploadOpen(false); notify("Evidencia añadida al hito y al Pasaporte Digital de la obra."); }} /> : null}
      {insuranceUploadOpen ? <InsuranceUploadModal onClose={() => setInsuranceUploadOpen(false)} onSaved={() => { setInsuranceUploadOpen(false); notify("Póliza RC enviada a verificación."); }} /> : null}
      {contractPreviewOpen ? <ContractPreviewModal onClose={() => setContractPreviewOpen(false)} onGenerate={() => { setContractPreviewOpen(false); notify("Contrato PDF generado y enviado a ambas partes para firma."); }} /> : null}

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
  onShowVerification,
  onPortfolio,
  onEvidence,
  onInsurance,
  expanded = false,
}: {
  projects: Project[];
  onPropose: (id: number) => void;
  onShowVerification: () => void;
  onPortfolio: () => void;
  onEvidence: () => void;
  onInsurance: () => void;
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
        <div className="market-hero-actions">
          <div className="market-score"><strong>92%</strong><span>compatibilidad media</span></div>
          <button type="button" onClick={onShowVerification}>Ver alta y test profesional</button>
        </div>
      </div>
      <div className="market-filters">
        <button className="active">Todos</button><button>Reforma integral</button><button>Cocinas</button><button>Madrid</button>
        <span>{projects.length} oportunidades</span>
      </div>
      <div className="professional-toolbox panel">
        <div><span>HERRAMIENTAS PROFESIONALES</span><strong>Trabaja y documenta sin salir de MiConstructor</strong></div>
        <button type="button" onClick={onPortfolio}>＋ Antes / después</button>
        <button type="button" onClick={onEvidence}>▧ Diario de obra</button>
        <button type="button" onClick={onInsurance}>◇ Seguro RC</button>
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
                <p>Ver el proyecto es gratis · Selecciones facturadas semanalmente</p>
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

function ProfessionalOnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedSpecialty, setSelectedSpecialty] = useState("reformas_integrales");
  const [assessment, setAssessment] = useState<PublicAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ passed: boolean; score: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/evaluacion-profesional?especialidad=${encodeURIComponent(selectedSpecialty)}`)
      .then((response) => {
        if (!response.ok) throw new Error("No se ha podido cargar el test.");
        return response.json();
      })
      .then((payload) => {
        if (active) setAssessment(payload.data as PublicAssessment);
      })
      .catch((fetchError: Error) => {
        if (active) setError(fetchError.message);
      });
    return () => { active = false; };
  }, [selectedSpecialty]);

  async function submitAssessment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assessment) return;

    const formData = new FormData(event.currentTarget);
    const respuestas = Object.fromEntries(
      assessment.questions.map((question) => [question.id, String(formData.get(question.id) || "")]),
    );

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/evaluacion-profesional", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          especialidad: selectedSpecialty,
          version: assessment.version,
          respuestas,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se ha podido corregir el test.");
      setResult({ passed: Boolean(payload.data.passed), score: Number(payload.data.score) });
      setStep(3);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se ha podido corregir el test.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop onboarding-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal onboarding-modal professional-onboarding" role="dialog" aria-modal="true" aria-labelledby="professional-onboarding-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="onboarding-brand">
          <BrandMark />
          <strong>MiConstructor</strong>
          <span>ALTA PROFESIONAL · PASO {step} DE 4</span>
          <button type="button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="onboarding-progress" aria-label={`Paso ${step} de 4`}><i style={{ width: `${(step / 4) * 100}%` }} /></div>

        {step === 1 ? (
          <>
            <div className="onboarding-copy">
              <span className="modal-kicker">PERFIL Y ESPECIALIDAD</span>
              <h2 id="professional-onboarding-title">La verificación empieza al crear la cuenta</h2>
              <p>El acceso profesional exige identidad, especialidad, test de conocimientos y revisión final.</p>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); setStep(2); }}>
              <div className="form-grid">
                <label>Nombre y apellidos<input required defaultValue="Carlos Romero" /></label>
                <label>Email profesional<input type="email" required defaultValue="carlos@reformasromero.es" /></label>
              </div>
              <div className="form-grid">
                <label>Empresa o razón social<input required defaultValue="Reformas Romero SL" /></label>
                <label>NIF / CIF<input required defaultValue="B12345678" /></label>
              </div>
              <div className="form-grid">
                <label>Teléfono profesional<input type="tel" required defaultValue="+34 600 000 000" /></label>
                <label>Especialidad principal<select required value={selectedSpecialty} onChange={(event) => { setSelectedSpecialty(event.target.value); setAssessment(null); setError(""); }}>{PROFESSIONAL_SPECIALTIES.map((specialty) => <option key={specialty.slug} value={specialty.slug}>{specialty.label}</option>)}</select></label>
              </div>
              <div className="verification-checklist">
                <span><b>01</b><strong>Datos profesionales</strong><small>Identidad, empresa y especialidad</small></span>
                <span><b>02</b><strong>Test técnico por oficio</strong><small>15 preguntas de la especialidad elegida</small></span>
                <span><b>03</b><strong>Aprobación por especialidad</strong><small>Solo permite aplicar a trabajos compatibles</small></span>
              </div>
              <button className="primary-button onboarding-submit" type="submit">Continuar al test <span>→</span></button>
              <p className="security-foot">Flujo demostrativo. No se guardan los datos introducidos.</p>
            </form>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="onboarding-copy">
              <span className="modal-kicker">EVALUACIÓN TÉCNICA POR ESPECIALIDAD</span>
              <h2 id="professional-onboarding-title">Test de {assessment?.specialty.label ?? "tu oficio"}</h2>
              <p>Son {assessment?.questionCount ?? 15} preguntas específicas del trabajo elegido. Debes responderlas todas y obtener al menos {assessment?.passScore ?? 80}%.</p>
            </div>
            <form className="assessment-form" onSubmit={submitAssessment}>
              {!assessment && !error ? <p className="assessment-loading">Preparando la evaluación…</p> : null}
              {assessment?.questions.map((question, index) => (
                <fieldset className="assessment-question" key={question.id}>
                  <legend><b>{String(index + 1).padStart(2, "0")}</b>{question.prompt}</legend>
                  {question.options.map((option) => (
                    <label key={option.id}>
                      <input type="radio" name={question.id} value={option.id} required />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              {error ? <p className="form-error standalone">{error}</p> : null}
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setStep(1)}>Atrás</button>
                <button className="primary-button" type="submit" disabled={!assessment || loading}>{loading ? "Corrigiendo…" : "Finalizar evaluación →"}</button>
              </div>
            </form>
          </>
        ) : null}

        {step === 3 && result ? (
          <div className={`assessment-result ${result.passed ? "passed" : "failed"}`}>
            <span className="assessment-result-icon">{result.passed ? "✓" : "!"}</span>
            <span className="modal-kicker">RESULTADO DEL TEST</span>
            <h2 id="professional-onboarding-title">{result.passed ? `${assessment?.specialty.label ?? "Especialidad"} aprobada` : "Todavía no está aprobado"}</h2>
            <strong>{result.score}%</strong>
            <p>{result.passed
              ? "Has superado las 15 preguntas de esta especialidad. El siguiente paso obligatorio es autorizar la domiciliación bancaria semanal; MiConstructor revisará después la documentación antes de activar este oficio."
              : "Es necesario alcanzar el 80% en el test específico de esta especialidad. Puedes repasar el temario y volver a realizar la evaluación."}</p>
            <div className="verification-status-flow">
              <span className="done"><b>1</b> Oficio evaluado</span>
              <i />
              <span className={result.passed ? "active" : "locked"}><b>2</b> Revisión documental</span>
              <i />
              <span className="locked"><b>3</b> Mandato SEPA</span>
            </div>
            {result.passed ? (
              <button className="primary-button onboarding-submit" type="button" onClick={() => setStep(4)}>Continuar a domiciliación →</button>
            ) : (
              <button className="primary-button onboarding-submit" type="button" onClick={() => { setResult(null); setStep(2); }}>Repetir el test</button>
            )}
            <small>Cada oficio adicional requiere su propio test y aprobación. Sin evaluación, revisión documental y mandato verificado, no puede usarse para aplicar a proyectos.</small>
          </div>
        ) : null}

        {step === 4 && result?.passed ? (
          <div className="direct-debit-step">
            <span className="modal-kicker">FACTURACIÓN PROFESIONAL</span>
            <h2 id="professional-onboarding-title">Domiciliación bancaria obligatoria</h2>
            <p>Las selecciones recibidas se agrupan en una factura semanal y se cobran mediante adeudo directo SEPA. MiConstructor no almacena el IBAN completo.</p>
            <div className="direct-debit-card">
              <span>SEPA</span><div><strong>Mandato de adeudo directo</strong><small>Configuración segura mediante el proveedor de pagos</small></div><b>OBLIGATORIO</b>
            </div>
            <label className="consent-row"><input type="checkbox" required /><span>Acepto la facturación semanal y entiendo que un impago suspenderá la cuenta hasta liquidar todo el saldo pendiente.</span></label>
            <button className="primary-button onboarding-submit" type="button" onClick={onClose}>Simular mandato y finalizar demo</button>
            <small>En producción, este botón abrirá el formulario seguro del proveedor para firmar el mandato SEPA.</small>
          </div>
        ) : null}
      </section>
    </div>
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
  const baseBudget = project?.budget ?? 0;
  const [labor, setLabor] = useState(Math.round(baseBudget * 0.48));
  const [materials, setMaterials] = useState(Math.round(baseBudget * 0.4));
  const [transport, setTransport] = useState(Math.round(baseBudget * 0.04));
  const [waste, setWaste] = useState(Math.round(baseBudget * 0.08));
  const subtotal = labor + materials + transport + waste;
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  if (!project) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="proposal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="modal-kicker">PROPUESTA PROFESIONAL</span><h2 id="proposal-title">{project.title}</h2><p>{project.location} · Presupuesto orientativo {euros.format(project.budget)}</p></div>
          <button type="button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <form action={onSubmit}>
          <div className="quote-builder-head"><span>GENERATOR DE DEVIZE</span><p>Construye una oferta clara por partidas. El cliente verá cada importe antes de aceptar.</p></div>
          <div className="quote-line-items">
            {[
              ["Mano de obra", labor, setLabor],
              ["Materiales y acabados", materials, setMaterials],
              ["Transporte", transport, setTransport],
              ["Residuos y medios auxiliares", waste, setWaste],
            ].map(([label, value, setter]) => (
              <label key={String(label)}><span>{label}</span><div className="money-input"><input type="number" min="0" step="50" value={Number(value)} onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))} /><span>EUR</span></div></label>
            ))}
          </div>
          <div className="quote-totals"><span>Subtotal <b>{euros.format(subtotal)}</b></span><span>IVA estimado (10%) <b>{euros.format(tax)}</b></span><strong>Total <b>{euros.format(total)}</b></strong></div>
          <div className="form-grid"><label>Plazo estimado<input name="days" type="number" min="1" max="730" defaultValue="60" required /></label><label>Validez de la oferta<input name="validity" type="number" min="1" max="90" defaultValue="30" required /></label></div>
          <label>Condiciones y alcance<textarea name="message" minLength={20} required placeholder="Describe el alcance, exclusiones, forma de trabajo y garantías…" /></label>
          {error ? <p className="form-error standalone">{error}</p> : null}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Guardar borrador</button><button className="primary-button" disabled={busy}>{busy ? "Enviando…" : "Generar y enviar presupuesto →"}</button></div>
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
  onInspectProfessional,
  onOpenContract,
}: {
  project: Project;
  projects: Project[];
  onSelect: (id: number) => void;
  onNavigate: (key: NavKey) => void;
  onNotify: (message: string) => void;
  onInspectProfessional: (name: string) => void;
  onOpenContract: () => void;
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

      {project.status === "Recibiendo ofertas" ? (
        <section className="received-quotes panel">
          <div className="panel-heading"><div><h2>Presupuestos recibidos</h2><p>Compara partidas, reseñas y trabajos reales antes de aceptar.</p></div><span className="verified">2 ofertas verificadas</span></div>
          <div className="received-quote-grid">
            {[
              ["Construcciones Rivas", "4,8", "36 reseñas", "14.850 €"],
              ["Reformas Alcázar", "4,9", "21 reseñas", "15.420 €"],
            ].map(([name, rating, reviews, amount]) => (
              <article key={name}><div><span>{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><small>✓ Verificado · Asegurado</small></div></div><p>★ {rating} · {reviews}</p><b>{amount}</b><button type="button" onClick={() => onInspectProfessional(name)}>Reseñas y antes/después</button><button className="accept-quote" type="button" onClick={onOpenContract}>Revisar presupuesto y contrato →</button></article>
            ))}
          </div>
        </section>
      ) : null}

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

function ProfessionalsView({ onNotify, onInspect }: { onNotify: (message: string) => void; onInspect: (name: string) => void }) {
  const professionals = [
    ["AS", "Arquitectura Sol", "Arquitectura y dirección de obra", "4,9", "Madrid"],
    ["CR", "Construcciones Rivas", "Reformas integrales", "4,8", "Madrid y Toledo"],
    ["EB", "EcoBuild Studio", "Eficiencia energética", "4,9", "Comunidad de Madrid"],
  ];
  return (
    <section className="listing-view">
      <div className="section-title"><div><span>RED VERIFICADA</span><h1>Profesionales</h1><p>Compara gratis. El contacto se desbloquea al añadir un profesional a tu shortlist.</p></div><button className="secondary-button" onClick={() => onNotify("Filtros activados.")}>Filtros</button></div>
      <div className="professional-grid">
        {professionals.map(([avatar, name, specialty, rating, area]) => (
          <article className="panel directory-card" key={name}>
            <div className="directory-avatar">{avatar}<i>✓</i></div><small>TEST, PERFIL Y RC APROBADOS</small><h2>{name}</h2><p>{specialty}</p><div><span>★ {rating}</span><span>◎ {area}</span></div><button className="review-button" onClick={() => onInspect(name)}>Ver reseñas y trabajos</button><button onClick={() => onNotify(`${name} añadido a la shortlist. La selección se incluirá en su facturación semanal.`)}>Añadir a shortlist</button>
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

function ProfessionalProofModal({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal proof-modal" role="dialog" aria-modal="true" aria-labelledby="proof-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><span className="modal-kicker">PERFIL PROFESIONAL VERIFICADO</span><h2 id="proof-title">{name}</h2><p>★ 4,9 · 36 reseñas verificadas · Seguro RC aprobado</p></div><button type="button" aria-label="Cerrar" onClick={onClose}>×</button></div>
        <div className="proof-content">
          <div className="proof-badges"><span>✓ Identidad</span><span>✓ Test profesional</span><span>◇ Asegurado</span><span>★ Pago verificado</span></div>
          <section><div className="proof-section-head"><h3>Antes y después</h3><small>Trabajos moderados por MiConstructor</small></div><div className="before-after"><article><div className="proof-image before" /><span>ANTES</span></article><article><div className="proof-image after" /><span>DESPUÉS</span></article></div><h4>Reforma integral de vivienda · Madrid</h4><p>Redistribución, instalaciones, cocina y acabados. Finalizada en 2026.</p></section>
          <section><div className="proof-section-head"><h3>Reseñas de clientes</h3><small>Solo proyectos finalizados y pagados</small></div><div className="review-list"><article><header><strong>María G.</strong><b>★★★★★</b></header><p>Presupuesto muy claro, comunicación constante y cada hito quedó documentado con fotografías.</p><small>Reforma integral · Pago verificado</small></article><article><header><strong>Javier R.</strong><b>★★★★★</b></header><p>Cumplieron el plazo y explicaron con transparencia cualquier cambio antes de ejecutarlo.</p><small>Cocina y baño · Pago verificado</small></article></div></section>
          <p className="double-blind-note">Las reseñas son double-blind: se publican cuando ambas partes responden o al finalizar la ventana de 14 días.</p>
        </div>
      </section>
    </div>
  );
}

function PortfolioUploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="portfolio-upload-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="modal-kicker">PORTFOLIO PROFESIONAL</span><h2 id="portfolio-upload-title">Añadir un antes y después</h2><p>Las imágenes se revisan antes de aparecer en tu perfil.</p></div><button type="button" onClick={onClose}>×</button></div><form onSubmit={(event) => { event.preventDefault(); onSaved(); }}><label>Título del trabajo<input required defaultValue="Reforma integral de vivienda" /></label><div className="form-grid"><label>Foto antes<input type="file" accept="image/jpeg,image/png,image/webp" required /></label><label>Foto después<input type="file" accept="image/jpeg,image/png,image/webp" required /></label></div><label>Descripción<textarea minLength={20} required placeholder="Explica el alcance, materiales y resultado…" /></label><label className="consent-row"><input type="checkbox" required /><span>Confirmo que tengo autorización para publicar estas imágenes y que no muestran datos personales.</span></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Enviar a moderación →</button></div></form></section></div>
  );
}

function EvidenceUploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="evidence-upload-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="modal-kicker">DIARIO DE OBRA</span><h2 id="evidence-upload-title">Documentar el hito actual</h2><p>La evidencia quedará también en el Pasaporte Digital de la vivienda.</p></div><button type="button" onClick={onClose}>×</button></div><form onSubmit={(event) => { event.preventDefault(); onSaved(); }}><label>Hito<select defaultValue="Instalaciones"><option>Instalaciones y tabiquería</option><option>Revestimientos y acabados</option></select></label><label>Foto o vídeo<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required /></label><label>Descripción técnica<textarea minLength={10} required placeholder="Ej. Sustitución completa de tuberías y ubicación de nuevas llaves de corte…" /></label><div className="passport-callout"><span>▧</span><div><strong>Pasaporte Digital</strong><p>Este registro conservará qué se cambió, dónde y en qué fecha.</p></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Guardar evidencia →</button></div></form></section></div>
  );
}

function InsuranceUploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="insurance-upload-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="modal-kicker">SEGURO DE RESPONSABILIDAD CIVIL</span><h2 id="insurance-upload-title">Solicitar badge «Asegurado»</h2><p>El badge solo aparece después de revisar vigencia y cobertura.</p></div><button type="button" onClick={onClose}>×</button></div><form onSubmit={(event) => { event.preventDefault(); onSaved(); }}><div className="form-grid"><label>Aseguradora<input required placeholder="Nombre de la aseguradora" /></label><label>Cobertura<div className="money-input"><input type="number" min="1" required defaultValue="300000" /><span>EUR</span></div></label></div><div className="form-grid"><label>Válida desde<input type="date" required /></label><label>Válida hasta<input type="date" required /></label></div><label>Póliza en PDF<input type="file" accept="application/pdf" required /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Enviar a verificación →</button></div></form></section></div>
  );
}

function ContractPreviewModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal contract-modal" role="dialog" aria-modal="true" aria-labelledby="contract-preview-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="modal-kicker">CONTRATO DIGITAL DE OBRA</span><h2 id="contract-preview-title">Revisa antes de aceptar</h2><p>El contrato se genera a partir del proyecto y del presupuesto seleccionado.</p></div><button type="button" onClick={onClose}>×</button></div><div className="contract-preview"><header><span>MI CONSTRUCTOR</span><b>MC-000002</b></header><h3>Contrato de ejecución de obra</h3><p><strong>Partes:</strong> María López y Construcciones Rivas.</p><p><strong>Objeto:</strong> Renovación de cocina en Madrid, según alcance y partidas del presupuesto.</p><div className="contract-summary"><span>Mano de obra <b>7.100 €</b></span><span>Materiales <b>5.900 €</b></span><span>Transporte y residuos <b>1.850 €</b></span><strong>Total aceptado <b>14.850 €</b></strong></div><p><strong>Control:</strong> pagos por hitos, evidencias obligatorias, cambios de alcance documentados y trazabilidad completa.</p><small>Este modelo debe revisarse y completarse con las condiciones particulares de cada obra antes de la firma.</small></div><div className="modal-actions contract-actions"><button type="button" className="secondary-button" onClick={onClose}>Volver</button><button type="button" className="primary-button" onClick={onGenerate}>Aceptar y generar PDF →</button></div></section></div>
  );
}
