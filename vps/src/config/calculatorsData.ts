export type CalculatorUnitLabel = "m²" | "unidades";

export type CalculatorData = {
  slug: string;
  title: string;
  description: string;
  pricePerM2Min: number;
  pricePerM2Max: number;
  unitLabel: CalculatorUnitLabel;
};

export const calculatorQualityFactors = {
  basica: 0.85,
  media: 1,
  premium: 1.25,
} as const;

export const calculatorsData: readonly CalculatorData[] = [
  {
    slug: "bano",
    title: "Calculadora de reforma de baño",
    description: "Calcula un rango orientativo para reformar un baño según superficie y nivel de calidad.",
    pricePerM2Min: 450,
    pricePerM2Max: 850,
    unitLabel: "m²",
  },
  {
    slug: "cocina",
    title: "Calculadora de reforma de cocina",
    description: "Estima el coste orientativo de una reforma de cocina por superficie y calidad de acabados.",
    pricePerM2Min: 550,
    pricePerM2Max: 1100,
    unitLabel: "m²",
  },
  {
    slug: "pintura",
    title: "Calculadora de pintura",
    description: "Estima un rango de precio para trabajos de pintura interior o exterior por superficie.",
    pricePerM2Min: 8,
    pricePerM2Max: 18,
    unitLabel: "m²",
  },
  {
    slug: "fachadas",
    title: "Calculadora de fachadas",
    description: "Calcula un rango orientativo para rehabilitación, reparación o acabado de fachadas.",
    pricePerM2Min: 35,
    pricePerM2Max: 120,
    unitLabel: "m²",
  },
  {
    slug: "ventanas",
    title: "Calculadora de ventanas",
    description: "Estima el coste de sustitución o instalación de ventanas según unidades y calidad.",
    pricePerM2Min: 250,
    pricePerM2Max: 900,
    unitLabel: "unidades",
  },
  {
    slug: "domotica",
    title: "Calculadora de domótica",
    description: "Calcula un rango orientativo para puntos o dispositivos de automatización doméstica.",
    pricePerM2Min: 120,
    pricePerM2Max: 450,
    unitLabel: "unidades",
  },
  {
    slug: "suelo-parquet",
    title: "Calculadora de suelo y parquet",
    description: "Estima el coste de suministro e instalación de suelo laminado, parquet o tarima.",
    pricePerM2Min: 25,
    pricePerM2Max: 70,
    unitLabel: "m²",
  },
  {
    slug: "tejados",
    title: "Calculadora de tejados y cubiertas",
    description: "Calcula un rango orientativo para reparación o renovación de tejados y cubiertas.",
    pricePerM2Min: 70,
    pricePerM2Max: 160,
    unitLabel: "m²",
  },
  {
    slug: "alicatado",
    title: "Calculadora de alicatado",
    description: "Estima un rango para colocación o renovación de azulejos y revestimientos cerámicos.",
    pricePerM2Min: 25,
    pricePerM2Max: 65,
    unitLabel: "m²",
  },
  {
    slug: "electricidad",
    title: "Calculadora de instalación eléctrica",
    description: "Calcula un rango orientativo para renovación o ejecución de instalaciones eléctricas.",
    pricePerM2Min: 45,
    pricePerM2Max: 90,
    unitLabel: "m²",
  },
  {
    slug: "fontaneria",
    title: "Calculadora de fontanería",
    description: "Estima el coste orientativo de renovación o instalación de redes de fontanería.",
    pricePerM2Min: 50,
    pricePerM2Max: 110,
    unitLabel: "m²",
  },
  {
    slug: "aislamiento",
    title: "Calculadora de aislamiento",
    description: "Calcula un rango orientativo para aislamiento térmico o acústico por superficie.",
    pricePerM2Min: 30,
    pricePerM2Max: 100,
    unitLabel: "m²",
  },
  {
    slug: "terrazas",
    title: "Calculadora de terrazas",
    description: "Estima un rango para impermeabilización, pavimento y renovación de terrazas.",
    pricePerM2Min: 45,
    pricePerM2Max: 120,
    unitLabel: "m²",
  },
  {
    slug: "pladur",
    title: "Calculadora de pladur",
    description: "Calcula un rango orientativo para tabiques, trasdosados o falsos techos de placa de yeso.",
    pricePerM2Min: 25,
    pricePerM2Max: 55,
    unitLabel: "m²",
  },
  {
    slug: "puertas-interiores",
    title: "Calculadora de puertas interiores",
    description: "Estima el coste de suministro e instalación de puertas interiores por unidades.",
    pricePerM2Min: 180,
    pricePerM2Max: 500,
    unitLabel: "unidades",
  },
] as const;

const calculatorsBySlug = new Map(calculatorsData.map((calculator) => [calculator.slug, calculator]));

export function getCalculatorData(slug: string): CalculatorData | undefined {
  return calculatorsBySlug.get(slug);
}
