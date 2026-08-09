import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/app/components/brand-logo";
import { getLocalSeoData, LOCAL_SEO_PARAMS } from "@/lib/local-seo";
import { getLocalProfessionals } from "@/lib/server/local-seo";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return LOCAL_SEO_PARAMS;
}

export async function generateMetadata({ params }: { params: Promise<{ service: string; city: string }> }): Promise<Metadata> {
  const { service, city } = await params;
  const data = getLocalSeoData(service, city);
  if (!data) return {};
  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: `https://miconstructor.es/${service}/${city}` },
  };
}

function safeJson(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function LocalServicePage({ params }: { params: Promise<{ service: string; city: string }> }) {
  const { service, city } = await params;
  const data = getLocalSeoData(service, city);
  if (!data) notFound();
  const professionals = await getLocalProfessionals(service, city);
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${data.service.titlePlural} en ${data.city.name}`,
    areaServed: { "@type": "City", name: data.city.name, containedInPlace: { "@type": "AdministrativeArea", name: data.city.province } },
    provider: { "@type": "Organization", name: "MiConstructor", url: "https://miconstructor.es" },
  };
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: data.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) };
  const professionalSchemas = professionals.filter((item) => Number(item.review_count) > 0).map((item) => ({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: item.company_name || item.name,
    areaServed: data.city.name,
    aggregateRating: { "@type": "AggregateRating", ratingValue: Number(item.rating_value), reviewCount: Number(item.review_count), bestRating: 5, worstRating: 1 },
  }));

  return (
    <main className="local-seo-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(faqSchema) }} />
      {professionalSchemas.map((schema, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(schema) }} />)}
      <header className="local-nav"><Link href="/" aria-label="MiConstructor inicio"><BrandMark /><strong>MiConstructor</strong></Link><nav><Link href={`/precios/${service}/${city}`}>Guía de precios</Link><Link href="/demo">Ver plataforma</Link></nav></header>
      <section className="local-hero"><div><span>{data.service.titlePlural.toUpperCase()} · {data.city.name.toUpperCase()}</span><h1>{data.heading}</h1><p>{data.description}</p><Link href="/demo">Pide presupuesto en 2 min <b>→</b></Link><small>Publicación gratuita · Profesionales verificados · Presupuestos comparables</small></div><aside><small>REFERENCIA LOCAL 2026</small><strong>{data.price.minimum.toLocaleString("es-ES")} € – {data.price.maximum.toLocaleString("es-ES")} €</strong><span>Rango orientativo por {data.price.unit}</span><Link href={`/precios/${service}/${city}`}>Ver desglose y factores de precio</Link></aside></section>
      <section className="local-section"><div className="local-section-head"><span>PROFESIONALES EN LA ZONA</span><h2>Compara experiencia, reseñas y trabajos anteriores</h2></div>{professionals.length ? <div className="local-professionals">{professionals.map((professional) => <article key={String(professional.email)}><span>{String(professional.company_name || professional.name).slice(0,2).toUpperCase()}</span><h3>{String(professional.company_name || professional.name)}</h3><p>{String(professional.professional_specialty)}</p>{Number(professional.review_count) > 0 ? <b>★ {String(professional.rating_value)} · {String(professional.review_count)} reseñas</b> : <b>Nuevo en MiConstructor</b>}<small>{Number(professional.insured) ? "◇ Asegurado · ✓ Verificado" : "✓ Identidad y especialidad verificadas"}</small></article>)}</div> : <div className="local-empty"><strong>Estamos incorporando profesionales verificados en {data.city.name}.</strong><p>Puedes publicar el proyecto ahora; solo te avisaremos cuando haya candidatos compatibles.</p></div>}</section>
      <section className="local-process">{data.service.process.map((step, index) => <article key={step}><b>0{index + 1}</b><strong>{step}</strong><p>{index === 0 ? "Describe el trabajo y utiliza el estimador orientativo." : index === 1 ? "Compara cada partida, plazo, reseña y garantía." : "Firma el contrato y conserva evidencias en el Pasaporte Digital."}</p></article>)}</section>
      <section className="local-section local-faq"><div className="local-section-head"><span>PREGUNTAS FRECUENTES</span><h2>{data.service.titlePlural} en {data.city.name}</h2></div>{data.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<b>＋</b></summary><p>{faq.answer}</p></details>)}</section>
      <section className="local-cta"><h2>Define tu proyecto antes de pedir ofertas.</h2><p>Obtén una estimación orientativa y recibe presupuestos estructurados de profesionales de {data.city.name}.</p><Link href="/demo">Pide presupuesto en 2 min →</Link></section>
    </main>
  );
}
