export const LOCAL_SERVICES = {
  "reformas-de-banos": {
    singular: "reforma de baño",
    plural: "reformas de baños",
    professionalPlural: "especialistas en reformas de baños",
    titlePlural: "Reformas de Baños",
    basePrice: { minimum: 5_500, maximum: 10_500, unit: "proyecto" },
    priceQuestion: "¿Cuánto cuesta reformar un baño",
    process: ["Medición y estado de instalaciones", "Deviz por partidas", "Ejecución documentada por hitos"],
  },
  pintores: {
    singular: "servicio de pintura",
    plural: "pintores",
    professionalPlural: "pintores profesionales",
    titlePlural: "Pintores",
    basePrice: { minimum: 8, maximum: 20, unit: "m²" },
    priceQuestion: "¿Cuánto cuesta pintar una vivienda",
    process: ["Medición de superficies", "Preparación y protección", "Aplicación y revisión final"],
  },
  electricistas: {
    singular: "servicio de electricidad",
    plural: "electricistas",
    professionalPlural: "electricistas autorizados",
    titlePlural: "Electricistas",
    basePrice: { minimum: 2_500, maximum: 7_000, unit: "proyecto" },
    priceQuestion: "¿Cuánto cuesta renovar una instalación eléctrica",
    process: ["Diagnóstico de la instalación", "Propuesta técnica", "Certificación y cierre documentado"],
  },
};

export const LOCAL_CITIES = {
  linares: {
    name: "Linares",
    province: "Jaén",
    priceFactor: 0.96,
    localCopy: "Compara profesionales que trabajan en Linares y su entorno, con identidad, especialidad y documentación revisadas.",
  },
  jaen: {
    name: "Jaén",
    province: "Jaén",
    priceFactor: 1,
    localCopy: "Encuentra profesionales disponibles en Jaén capital y compara alcance, partidas y referencias dentro de un único proceso.",
  },
  ubeda: {
    name: "Úbeda",
    province: "Jaén",
    priceFactor: 0.98,
    localCopy: "Solicita presupuestos a profesionales que prestan servicio en Úbeda y revisa trabajos anteriores antes de seleccionar.",
  },
};

export function getLocalSeoData(serviceSlug, citySlug) {
  const service = LOCAL_SERVICES[serviceSlug];
  const city = LOCAL_CITIES[citySlug];
  if (!service || !city) return null;
  const price = {
    minimum: Math.round(service.basePrice.minimum * city.priceFactor),
    maximum: Math.round(service.basePrice.maximum * city.priceFactor),
    unit: service.basePrice.unit,
  };
  return {
    serviceSlug,
    citySlug,
    service,
    city,
    price,
    title: `Los Mejores ${service.titlePlural} en ${city.name} | Presupuestos - MiConstructor`,
    heading: `Encuentra ${service.professionalPlural} en ${city.name} (${city.province})`,
    description: `${city.localCopy} Publica tu proyecto y recibe presupuestos estructurados de ${service.plural}.`,
    faqs: [
      {
        question: `${service.priceQuestion} en ${city.name}?`,
        answer: `Como referencia inicial, el rango orientativo es de ${price.minimum.toLocaleString("es-ES")} a ${price.maximum.toLocaleString("es-ES")} € por ${price.unit}. El estado previo, la superficie y las calidades pueden modificarlo.`,
      },
      {
        question: `¿Cómo verifica MiConstructor a los profesionales de ${city.name}?`,
        answer: "Se revisan identidad, NIF/CIF, especialidad, test de conocimientos y documentación. El seguro RC se muestra con badge separado cuando su póliza está aprobada y vigente.",
      },
      {
        question: "¿Puedo comparar presupuestos antes de contratar?",
        answer: "Sí. Cada profesional desglosa mano de obra, materiales, transporte, residuos, impuestos y plazo antes de que aceptes y se genere el contrato digital.",
      },
    ],
  };
}

export const LOCAL_SEO_PARAMS = Object.keys(LOCAL_SERVICES).flatMap((service) =>
  Object.keys(LOCAL_CITIES).map((city) => ({ service, city })),
);
