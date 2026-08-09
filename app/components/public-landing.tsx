import Link from "next/link";
import Image from "next/image";
import BrandLogo from "./brand-logo";

type IconName = "brief" | "compare" | "milestone" | "shield" | "document" | "layers";

const processSteps: Array<{
  number: string;
  icon: IconName;
  title: string;
  copy: string;
  detail: string;
}> = [
  {
    number: "01",
    icon: "brief",
    title: "Define bien el proyecto",
    copy: "Describe el alcance, la ubicación, el plazo y el presupuesto con una guía que ordena la información desde el inicio.",
    detail: "Brief estructurado",
  },
  {
    number: "02",
    icon: "compare",
    title: "Compara con criterio",
    copy: "Analiza propuestas de profesionales evaluados y verificados por precio, calendario, especialidad y documentación disponible.",
    detail: "Decisión informada",
  },
  {
    number: "03",
    icon: "milestone",
    title: "Controla cada avance",
    copy: "Divide el trabajo en hitos, registra evidencias y conserva una trazabilidad clara de acuerdos, cambios y aprobaciones.",
    detail: "Seguimiento por hitos",
  },
];

const milestones = [
  ["Planificación y reserva", "1.200 €", "done"],
  ["Demolición y preparación", "3.000 €", "done"],
  ["Instalaciones y albañilería", "5.000 €", "active"],
  ["Acabados y entrega", "2.800 €", "locked"],
];

const trustItems: Array<{ icon: IconName; title: string; copy: string }> = [
  { icon: "shield", title: "Profesionales evaluados", copy: "Test obligatorio, identidad y documentación revisados antes de activar el perfil." },
  { icon: "layers", title: "Hitos trazables", copy: "Alcance, importe y estado claros en cada etapa." },
  { icon: "document", title: "Todo documentado", copy: "Propuestas, evidencias y aprobaciones en un mismo lugar." },
];

function LineIcon({ name }: { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === "brief" && <><path {...common} d="M6 3.5h9l3 3V20.5H6z"/><path {...common} d="M15 3.5v3h3M9 11h6M9 15h4"/></>}
      {name === "compare" && <><path {...common} d="M5 5h6v6H5zM13 13h6v6h-6z"/><path {...common} d="M14 6h5M16.5 3.5V8.5M5 16h5M7.5 13.5v5"/></>}
      {name === "milestone" && <><path {...common} d="M5 4v16M5 7h8l-1.6 3L13 13H5"/><path {...common} d="M16 16.5l1.7 1.7L21 14.5"/></>}
      {name === "shield" && <><path {...common} d="M12 3.5 19 6v5.5c0 4.1-2.8 7.2-7 9-4.2-1.8-7-4.9-7-9V6z"/><path {...common} d="m8.7 12 2.1 2.1 4.5-4.5"/></>}
      {name === "document" && <><path {...common} d="M6 3.5h9l3 3V20.5H6z"/><path {...common} d="M15 3.5v3h3M9 11h6M9 15h6M9 18h3"/></>}
      {name === "layers" && <><path {...common} d="m12 3.5 8 4.2-8 4.2-8-4.2zM4 12l8 4.2 8-4.2M4 16.3l8 4.2 8-4.2"/></>}
    </svg>
  );
}

function PublicLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className="public-logo" href="/" aria-label="MiConstructor, página principal">
      <BrandLogo inverse={inverse} />
    </Link>
  );
}

export default function PublicLanding() {
  return (
    <div className="public-site">
      <div className="public-topline">
        <div className="public-container">
          <span>MiConstructor está en fase MVP</span>
          <span>Demo abierta · Sin registro</span>
        </div>
      </div>

      <header className="public-header">
        <div className="public-container public-header-inner">
          <PublicLogo />
          <nav aria-label="Navegación del sitio">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#seguridad">Control y seguridad</a>
            <a href="#profesionales">Para profesionales</a>
          </nav>
          <div className="public-header-actions">
            <Link className="public-nav-demo" href="/demo">Ver plataforma</Link>
            <Link className="public-button public-button-primary" href="/demo">Publicar proyecto <span>↗</span></Link>
          </div>
        </div>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-hero-grid" aria-hidden="true" />
          <div className="public-container public-hero-inner">
            <div className="public-hero-copy">
              <h1>Construir bien empieza por <em>controlar cada decisión.</em></h1>
              <p>
                MiConstructor conecta clientes y profesionales en un espacio de trabajo común:
                propuestas comparables, presupuesto por hitos, evidencias y seguimiento de principio a fin.
              </p>
              <div className="public-hero-actions">
                <Link className="public-button public-button-primary public-button-large" href="/demo">
                  Publicar un proyecto <span>↗</span>
                </Link>
                <Link className="public-button public-button-quiet public-button-large" href="/demo">
                  Explorar la demo <span>→</span>
                </Link>
              </div>
              <div className="public-hero-assurance">
                <span><b>01</b> Test y perfil verificados</span>
                <span><b>02</b> Control por hitos</span>
                <span><b>03</b> Evidencias centralizadas</span>
              </div>
            </div>

            <figure className="public-hero-image">
              <div className="public-image-grid" aria-hidden="true" />
              <Image
                src="/miconstructor-platform.webp"
                alt="MiConstructor representado como una construcción modular conectada digitalmente"
                width={1280}
                height={853}
                priority
                unoptimized
                sizes="(max-width: 900px) 100vw, 54vw"
              />
              <figcaption>
                <span><i /> CONSTRUCCIÓN</span>
                <span><i /> CONTROL DIGITAL</span>
                <span><i /> CONTACTOS CUALIFICADOS</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="public-trust" aria-label="Principios de la plataforma">
          <div className="public-container public-trust-grid">
            <div className="public-trust-intro">
              <span>UNA BASE MÁS SÓLIDA</span>
              <strong>Menos incertidumbre.<br/>Más trazabilidad.</strong>
            </div>
            {trustItems.map((item) => (
              <article key={item.title}>
                <i><LineIcon name={item.icon} /></i>
                <div><strong>{item.title}</strong><p>{item.copy}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="public-section public-process" id="como-funciona">
          <div className="public-container">
            <div className="public-section-heading public-section-heading-split">
              <div>
                <span className="public-kicker dark"><i /> DEL BRIEF A LA ENTREGA</span>
                <h2>La obra deja de ser<br/>una caja negra.</h2>
              </div>
              <p>Un proceso compartido entre cliente y profesional, diseñado para saber qué se acordó, qué está ocurriendo y qué viene después.</p>
            </div>
            <div className="public-steps">
              {processSteps.map((step) => (
                <article key={step.number}>
                  <header><span>{step.number}</span><small>{step.detail}</small></header>
                  <i className="public-step-icon"><LineIcon name={step.icon} /></i>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                  <span className="public-step-line" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section public-control" id="seguridad">
          <div className="public-container public-control-grid">
            <div className="public-control-copy">
              <span className="public-kicker dark"><i /> CONTROL FINANCIERO Y OPERATIVO</span>
              <h2>El presupuesto avanza al ritmo real de la obra.</h2>
              <p>Organiza el importe por hitos verificables. Cada etapa conserva su alcance, sus evidencias y su estado de aprobación.</p>
              <ul>
                <li><b>01</b><span><strong>Alcance e importe definidos</strong><small>Cada fase empieza con expectativas visibles para ambas partes.</small></span></li>
                <li><b>02</b><span><strong>Evidencias en contexto</strong><small>Fotos, documentos, cambios y confirmaciones vinculados al hito.</small></span></li>
                <li><b>03</b><span><strong>Periodo de revisión</strong><small>Tiempo para comprobar el resultado antes de cerrar una etapa.</small></span></li>
              </ul>
              <small className="public-legal-note">El depósito en garantía y los pagos mostrados forman parte de la simulación del MVP. La operación con dinero real requerirá un proveedor autorizado y condiciones legales definitivas.</small>
            </div>
            <div className="public-milestone-shell">
              <div className="public-milestone-board">
                <header>
                  <div><small>OBRA 024</small><strong>Control de hitos</strong></div>
                  <b><i /> 58% completado</b>
                </header>
                {milestones.map(([name, amount, state], index) => (
                  <div className={`public-milestone ${state}`} key={name}>
                    <span>{state === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{name}</strong><small>{state === "done" ? "Completado y aprobado" : state === "active" ? "En curso · Pendiente de revisión" : "Bloqueado hasta completar el hito anterior"}</small></div>
                    <b>{amount}</b>
                  </div>
                ))}
                <footer><span>Presupuesto del proyecto</span><strong>12.000 €</strong></footer>
              </div>
              <span className="public-security-seal"><LineIcon name="shield" /><b>TRAZABILIDAD</b><small>Registro de actividad</small></span>
            </div>
          </div>
        </section>

        <section className="public-section public-professionals" id="profesionales">
          <div className="public-container public-pro-grid">
            <div className="public-pro-copy">
              <span className="public-kicker"><i /> ESPACIO PROFESIONAL</span>
              <h2>Proyectos adecuados.<br/>Gestión sin ruido.</h2>
              <p>El alta y la consulta de proyectos son gratuitas. El profesional solo paga cuando un cliente lo selecciona para su shortlist y se desbloquean los datos de contacto.</p>
              <div className="public-pro-points">
                <span><b>01</b> Test de conocimientos obligatorio al crear la cuenta</span>
                <span><b>02</b> Documentación y especialidad revisadas antes de activar el perfil</span>
                <span><b>03</b> Sin suscripción y sin comisión sobre el valor final de la obra</span>
              </div>
              <Link className="public-button public-button-bronze" href="/demo?registro=profesional">Crear cuenta profesional <span>↗</span></Link>
            </div>
            <div className="public-opportunities">
              <header><div><small>PANEL PROFESIONAL</small><strong>Oportunidades seleccionadas</strong></div><b>03</b></header>
              <article><i>01</i><div><strong>Renovación de baño principal</strong><small>Úbeda, Jaén · Fontanería y acabados</small></div><b>6.800 €</b></article>
              <article className="featured"><i>02</i><div><strong>Aislamiento y fachada exterior</strong><small>Baeza, Jaén · Eficiencia energética</small></div><b>18.500 €</b></article>
              <article><i>03</i><div><strong>Reforma integral de vivienda</strong><small>Linares, Jaén · Proyecto completo</small></div><b>32.000 €</b></article>
              <footer><span>Ver proyectos es gratis</span><Link href="/demo">Abrir panel <b>→</b></Link></footer>
            </div>
          </div>
        </section>

        <section className="public-section public-shortlist-model" id="modelo-shortlist">
          <div className="public-container">
            <div className="public-section-heading public-section-heading-split">
              <div>
                <span className="public-kicker dark"><i /> PAGO SOLO POR CONTACTO CUALIFICADO</span>
                <h2>Gratis hasta entrar<br/>en la shortlist.</h2>
              </div>
              <p>La tarifa se fija por el presupuesto estimado cuando el cliente selecciona al profesional. El contacto se desbloquea después del cargo; MiConstructor no cobra ningún porcentaje sobre la obra contratada.</p>
            </div>
            <div className="public-shortlist-flow">
              <article><b>01</b><span>Registro y proyectos</span><strong>0 €</strong><p>Crear el perfil, superar la verificación y consultar oportunidades no tiene coste.</p></article>
              <article><b>02</b><span>Selección del cliente</span><strong>Tarifa por tramo</strong><p>El valor estimado del proyecto determina una tarifa de lead clara y conocida.</p></article>
              <article><b>03</b><span>Contacto desbloqueado</span><strong>Sin comisión final</strong><p>Se carga el saldo o el método autorizado. El importe de la obra queda fuera de la comisión.</p></article>
            </div>
            <div className="public-pricing-examples" aria-label="Ejemplos de tarifas de shortlist">
              <span><small>Proyecto hasta 2.500 €</small><strong>8,90 €</strong></span>
              <span><small>Proyecto de 7.501 € a 15.000 €</small><strong>24,90 €</strong></span>
              <span><small>Proyecto de 30.001 € a 60.000 €</small><strong>59,90 €</strong></span>
              <em>Tarifas MVP orientativas · IVA y condiciones definitivas pendientes de validación comercial.</em>
            </div>
          </div>
        </section>

        <section className="public-final-cta">
          <div className="public-final-grid" aria-hidden="true" />
          <div className="public-container">
            <span className="public-kicker"><i /> TU PROYECTO EMPIEZA AQUÍ</span>
            <h2>Una forma más clara<br/>de construir confianza.</h2>
            <p>Explora el prototipo completo de MiConstructor. Sin registro y con datos de demostración.</p>
            <div>
              <Link className="public-button public-button-primary public-button-large" href="/demo">Entrar en la plataforma <span>↗</span></Link>
              <a className="public-button public-button-outline-light public-button-large" href="#como-funciona">Revisar el proceso</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-container public-footer-main">
          <div><PublicLogo inverse /><p>La capa digital entre tu idea y la obra terminada.</p></div>
          <nav><strong>PLATAFORMA</strong><a href="#como-funciona">Cómo funciona</a><a href="#seguridad">Control y seguridad</a><Link href="/demo">Demo interactiva</Link></nav>
          <nav><strong>MI CONSTRUCTOR</strong><a href="#profesionales">Para profesionales</a><a href="#modelo-shortlist">Modelo shortlist</a><span>Privacidad</span><span>Aviso legal</span></nav>
          <div className="public-footer-status"><i /> MVP EN DESARROLLO<small>Linares · España</small></div>
        </div>
        <div className="public-container public-footer-bottom"><span>© 2026 MiConstructor</span><span>Proyectos que avanzan con control.</span></div>
      </footer>
    </div>
  );
}
