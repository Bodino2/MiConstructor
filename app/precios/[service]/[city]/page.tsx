import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocalSeoData, LOCAL_SEO_PARAMS } from "@/lib/local-seo";

export function generateStaticParams() { return LOCAL_SEO_PARAMS; }

export async function generateMetadata({ params }: { params: Promise<{ service: string; city: string }> }): Promise<Metadata> {
  const { service, city } = await params;
  const data = getLocalSeoData(service, city);
  if (!data) return {};
  return { title: `${data.service.priceQuestion} en ${data.city.name} en 2026? | MiConstructor`, description: `Rangos orientativos, partidas y factores que influyen en el precio de ${data.service.plural} en ${data.city.name}.`, alternates: { canonical: `https://miconstructor.es/precios/${service}/${city}` } };
}

export default async function LocalPriceGuide({ params }: { params: Promise<{ service: string; city: string }> }) {
  const { service, city } = await params;
  const data = getLocalSeoData(service, city);
  if (!data) notFound();
  return <main className="price-guide"><nav><Link href="/">MiConstructor</Link><span>›</span><Link href={`/${service}/${city}`}>{data.service.titlePlural} en {data.city.name}</Link></nav><article><span>GUÍA LOCAL DE PRECIOS · 2026</span><h1>{data.service.priceQuestion} en {data.city.name} en 2026?</h1><p>El rango orientativo actual parte de <strong>{data.price.minimum.toLocaleString("es-ES")} €</strong> y puede alcanzar <strong>{data.price.maximum.toLocaleString("es-ES")} €</strong> por {data.price.unit}. Es una referencia previa a la visita técnica, no una oferta cerrada.</p><h2>Qué determina el presupuesto</h2><ul><li>Superficie y estado previo de la vivienda o instalación.</li><li>Calidad de materiales, acabados y equipamiento.</li><li>Accesos, retirada de residuos, licencias y complejidad técnica.</li><li>Cambios de instalaciones o elementos estructurales.</li></ul><h2>Cómo comparar sin sorpresas</h2><p>MiConstructor exige presupuestos por partidas para separar mano de obra, materiales, transporte, residuos e impuestos. Cuando aceptas, el sistema genera el contrato y divide la ejecución en hitos documentados.</p><div className="price-guide-cta"><strong>Obtén una estimación para tu proyecto</strong><p>Compara hasta tres presupuestos de {data.service.professionalPlural} en {data.city.name}.</p><Link href={`/${service}/${city}`}>Ver profesionales y pedir presupuesto →</Link></div><small>Los importes son orientativos y deben actualizarse con datos de mercado y ofertas reales de la zona. El tratamiento del IVA depende del tipo de obra y de los requisitos legales aplicables.</small></article></main>;
}
