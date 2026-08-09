import Link from "next/link";

const processSteps = [
  {
    number: "01",
    icon: "▤",
    title: "Cuéntanos tu proyecto",
    copy: "Describe la reforma, añade la ubicación y marca un presupuesto. Te guiamos paso a paso.",
  },
  {
    number: "02",
    icon: "◎",
    title: "Compara profesionales",
    copy: "Recibe propuestas de empresas verificadas y compara precio, plazo, experiencia y valoraciones.",
  },
  {
    number: "03",
    icon: "✓",
    title: "Avanza por hitos",
    copy: "Cada etapa queda documentada. Revisa el trabajo y mantén el control sobre el siguiente paso.",
  },
];

const milestones = [
  ["Reserva y planificación", "1.200 €", "done"],
  ["Demolición y preparación", "3.000 €", "done"],
  ["Instalaciones y albañilería", "5.000 €", "active"],
  ["Acabados y entrega", "2.800 €", "locked"],
];

function PublicLogo() {
  return (
    <Link className="public-logo" href="/" aria-label="MiConstructor, página principal">
      <span className="public-logo-mark">⌂</span>
      <strong>Mi<span>Constructor</span></strong>
    </Link>
  );
}

export default function PublicLanding() {
  return (
    <div className="public-site">
      <header className="public-header">
        <div className="public-container public-header-inner">
          <PublicLogo />
          <nav aria-label="Navegación del sitio">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#profesionales">Para profesionales</a>
            <a href="#seguridad">Seguridad</a>
            <Link className="public-nav-demo" href="/demo">Ver demo</Link>
            <Link className="public-button public-button-primary" href="/demo">Publicar proyecto <span>→</span></Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-grid-pattern" />
          <div className="public-container public-hero-inner">
            <div className="public-hero-copy">
              <span className="public-kicker">✓ PROFESIONALES VERIFICADOS · CONTROL POR HITOS</span>
              <h1>Tu reforma,<br/><em>bajo control</em><br/>de principio a fin.</h1>
              <p>
                Publica tu proyecto, compara propuestas y avanza por etapas con
                total transparencia. Toda la información de tu obra, en un solo lugar.
              </p>
              <div className="public-hero-actions">
                <Link className="public-button public-button-primary public-button-large" href="/demo">
                  Publicar mi proyecto <span>→</span>
                </Link>
                <a className="public-how-link" href="#como-funciona"><i>▶</i> Descubre cómo funciona</a>
              </div>
              <div className="public-social-proof">
                <div className="public-avatars"><span>RS</span><span>AM</span><span>JF</span><span>+2k</span></div>
                <div><strong>4,8/5 <b>★★★★★</b></strong><small>Valoración de clientes y profesionales</small></div>
              </div>
            </div>

            <div className="public-hero-visual" aria-label="Vista de ejemplo de un proyecto de reforma">
              <div className="public-blueprint">
                <div className="public-blueprint-toolbar"><i/><i/><i/><span>PLANO · COCINA</span></div>
                <div className="public-floorplan">
                  <span className="room-kitchen">COCINA<small>14,5 m²</small></span>
                  <span className="room-dining">COMEDOR<small>21,8 m²</small></span>
                  <span className="room-laundry">LAVADO<small>4,2 m²</small></span>
                </div>
              </div>
              <div className="public-float-card public-project-card">
                <div className="public-card-label"><i/> Proyecto en curso <b>58%</b></div>
                <strong>Reforma integral de cocina</strong>
                <small>⌖ Linares, Jaén</small>
                <div className="public-progress"><i style={{ width: "58%" }}/></div>
                <div className="public-dot-line"><span>✓</span><i/><span>✓</span><i/><span className="active">3</span><i/><span>4</span></div>
              </div>
              <div className="public-float-card public-secure-card">
                <span>▣</span><div><strong>Control por hitos</strong><small>5.000 € asignados al hito activo</small></div>
              </div>
              <div className="public-verified"><b>✓</b><span><strong>Profesional verificado</strong><small>Documentación revisada</small></span></div>
            </div>
          </div>

          <div className="public-container public-stats">
            <div><strong>2.400+</strong><span>Profesionales verificados</span></div>
            <div><strong>8,7 M€</strong><span>En proyectos gestionados*</span></div>
            <div><strong>96%</strong><span>Proyectos sin incidencias*</span></div>
            <div><strong>24 h</strong><span>Primera propuesta de media*</span></div>
          </div>
        </section>

        <section className="public-section public-process" id="como-funciona">
          <div className="public-container">
            <div className="public-section-heading">
              <span className="public-kicker dark">ASÍ DE SENCILLO</span>
              <h2>De la idea a la obra terminada,<br/>sin perder el control.</h2>
              <p>Un proceso claro para tomar mejores decisiones y reducir las sorpresas.</p>
            </div>
            <div className="public-steps">
              {processSteps.map((step) => (
                <article key={step.number}>
                  <span className="public-step-number">{step.number}</span>
                  <i className="public-step-icon">{step.icon}</i>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section public-control" id="seguridad">
          <div className="public-container public-control-grid">
            <div className="public-milestone-board">
              <header><span>Estado del proyecto</span><b>58% completado</b></header>
              {milestones.map(([name, amount, state], index) => (
                <div className={`public-milestone ${state}`} key={name}>
                  <span>{state === "done" ? "✓" : state === "active" ? index + 1 : "▣"}</span>
                  <div><strong>{name}</strong><small>{state === "done" ? "Completado y aprobado" : state === "active" ? "En curso · Pendiente de revisión" : "Pendiente"}</small></div>
                  <b>{amount}</b>
                </div>
              ))}
              <footer><span>Presupuesto total</span><strong>12.000 €</strong></footer>
            </div>
            <div className="public-control-copy">
              <span className="public-kicker dark">CONTROL FINANCIERO</span>
              <h2>El presupuesto avanza<br/>al ritmo de la obra.</h2>
              <p>Organiza el importe por hitos verificables. Cada etapa queda documentada y puedes ver qué está aprobado, activo o pendiente.</p>
              <ul>
                <li><b>✓</b><span><strong>Presupuesto sin sorpresas</strong><small>Importes y alcance definidos antes de empezar.</small></span></li>
                <li><b>✓</b><span><strong>Evidencias en cada etapa</strong><small>Fotos, documentos y confirmaciones centralizados.</small></span></li>
                <li><b>✓</b><span><strong>Periodo de revisión</strong><small>Tiempo para comprobar el resultado antes de cerrar el hito.</small></span></li>
              </ul>
              <small className="public-legal-note">* El depósito en garantía mostrado es una simulación del MVP. Los pagos reales requerirán un proveedor autorizado y condiciones legales definitivas.</small>
            </div>
          </div>
        </section>

        <section className="public-section public-professionals" id="profesionales">
          <div className="public-container public-pro-card">
            <div>
              <span className="public-kicker">PARA PROFESIONALES</span>
              <h2>Más proyectos adecuados.<br/>Menos tiempo buscando.</h2>
              <p>Crea un perfil verificado, recibe oportunidades por zona y especialidad y gestiona propuestas, hitos y documentación desde un solo lugar.</p>
              <Link className="public-button public-button-white" href="/demo">Ver el espacio profesional <span>→</span></Link>
            </div>
            <div className="public-opportunities">
              <header>Nuevas oportunidades cerca de ti <b>12</b></header>
              <article><i>▦</i><div><strong>Renovación de baño principal</strong><small>Úbeda, Jaén · 6.800 €</small></div><span>→</span></article>
              <article><i>▦</i><div><strong>Aislamiento y fachada exterior</strong><small>Baeza, Jaén · 18.500 €</small></div><span>→</span></article>
              <article><i>▦</i><div><strong>Reforma integral de vivienda</strong><small>Linares, Jaén · 32.000 €</small></div><span>→</span></article>
            </div>
          </div>
        </section>

        <section className="public-final-cta">
          <div className="public-container">
            <span className="public-kicker dark">TU PROYECTO EMPIEZA AQUÍ</span>
            <h2>Construye con claridad.<br/>Decide con confianza.</h2>
            <p>Explora el prototipo completo de MiConstructor sin registrarte.</p>
            <Link className="public-button public-button-primary public-button-large" href="/demo">Entrar en la demo <span>→</span></Link>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-container public-footer-main">
          <PublicLogo />
          <p>La plataforma que organiza reformas con claridad, trazabilidad y confianza.</p>
          <nav><a href="#como-funciona">Cómo funciona</a><a href="#seguridad">Seguridad</a><Link href="/demo">Demo</Link></nav>
        </div>
        <div className="public-container public-footer-bottom"><span>© 2026 MiConstructor. MVP en desarrollo.</span><span>Privacidad · Aviso legal · Cookies</span></div>
      </footer>
    </div>
  );
}
