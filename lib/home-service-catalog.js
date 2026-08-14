export const HOME_SERVICE_VERTICALS = {
  limpieza_mantenimiento: { label: "Limpieza y mantenimiento" },
  jardin_exterior: { label: "Jardín y exterior" },
};

export const HOME_SERVICE_FREQUENCIES = {
  PUNTUAL: { label: "Una sola vez", intervalDays: null },
  SEMANAL: { label: "Cada semana", intervalDays: 7 },
  CADA_2_SEMANAS: { label: "Cada dos semanas", intervalDays: 14 },
  MENSUAL: { label: "Cada mes", intervalDays: null },
};

export const HOME_SERVICES = {
  limpieza_hogar: {
    label: "Limpieza del hogar",
    vertical: "limpieza_mantenimiento",
    requiredSpecialty: "limpieza_profesional",
    recurrence: ["PUNTUAL", "SEMANAL", "CADA_2_SEMANAS", "MENSUAL"],
  },
  limpieza_profunda: {
    label: "Limpieza profunda",
    vertical: "limpieza_mantenimiento",
    requiredSpecialty: "limpieza_profesional",
    recurrence: ["PUNTUAL", "MENSUAL"],
  },
  limpieza_fin_obra: {
    label: "Limpieza fin de obra",
    vertical: "limpieza_mantenimiento",
    requiredSpecialty: "limpieza_profesional",
    recurrence: ["PUNTUAL"],
  },
  limpieza_mudanza: {
    label: "Limpieza de mudanza",
    vertical: "limpieza_mantenimiento",
    requiredSpecialty: "limpieza_profesional",
    recurrence: ["PUNTUAL"],
  },
  limpieza_cristales: {
    label: "Limpieza de cristales",
    vertical: "limpieza_mantenimiento",
    requiredSpecialty: "limpieza_profesional",
    recurrence: ["PUNTUAL", "MENSUAL"],
  },
  limpieza_comunidades: {
    label: "Limpieza de comunidades",
    vertical: "limpieza_mantenimiento",
    requiredSpecialty: "limpieza_profesional",
    recurrence: ["SEMANAL", "CADA_2_SEMANAS", "MENSUAL"],
  },
  limpieza_alojamiento_turistico: {
    label: "Limpieza para B&B y alojamientos turísticos",
    vertical: "limpieza_mantenimiento",
    requiredSpecialty: "limpieza_profesional",
    recurrence: ["PUNTUAL", "SEMANAL", "CADA_2_SEMANAS", "MENSUAL"],
    bnb: true,
    seasonal: true,
  },
  jardineria_mantenimiento: {
    label: "Mantenimiento de jardines",
    vertical: "jardin_exterior",
    requiredSpecialty: "jardineria",
    recurrence: ["PUNTUAL", "SEMANAL", "CADA_2_SEMANAS", "MENSUAL"],
    seasonal: true,
  },
  poda: {
    label: "Poda y cuidado de árboles",
    vertical: "jardin_exterior",
    requiredSpecialty: "jardineria",
    recurrence: ["PUNTUAL"],
  },
  cesped: {
    label: "Césped y siega",
    vertical: "jardin_exterior",
    requiredSpecialty: "jardineria",
    recurrence: ["PUNTUAL", "SEMANAL", "CADA_2_SEMANAS", "MENSUAL"],
    seasonal: true,
  },
  riego: {
    label: "Riego y mantenimiento",
    vertical: "jardin_exterior",
    requiredSpecialty: "jardineria",
    recurrence: ["PUNTUAL", "MENSUAL"],
    seasonal: true,
  },
  limpieza_terreno: {
    label: "Limpieza de terrenos y parcelas",
    vertical: "jardin_exterior",
    requiredSpecialty: "jardineria",
    recurrence: ["PUNTUAL"],
  },
  mantenimiento_piscina: {
    label: "Mantenimiento de piscina",
    vertical: "jardin_exterior",
    requiredSpecialty: "jardineria",
    recurrence: ["PUNTUAL", "SEMANAL", "CADA_2_SEMANAS", "MENSUAL"],
    seasonal: true,
  },
};

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
}

export function normalizeHomeService(value) {
  const key = normalize(value);
  return HOME_SERVICES[key] ? key : null;
}

export function getHomeService(value) {
  const slug = normalizeHomeService(value);
  return slug ? { slug, ...HOME_SERVICES[slug] } : null;
}

export function getHomeServiceCatalog() {
  return Object.entries(HOME_SERVICE_VERTICALS).map(([vertical, data]) => ({
    slug: vertical,
    label: data.label,
    services: Object.entries(HOME_SERVICES)
      .filter(([, service]) => service.vertical === vertical)
      .map(([slug, service]) => ({ slug, ...service })),
  }));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function madridDateIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nextOccurrenceDate(currentIsoDate, frequency, anchorDay = null) {
  if (frequency === "PUNTUAL") return null;
  const current = new Date(`${currentIsoDate}T12:00:00Z`);
  if (Number.isNaN(current.getTime())) return null;
  if (frequency === "SEMANAL" || frequency === "CADA_2_SEMANAS") {
    current.setUTCDate(current.getUTCDate() + HOME_SERVICE_FREQUENCIES[frequency].intervalDays);
    return isoDate(current);
  }
  if (frequency === "MENSUAL") {
    const requestedAnchor = Number(anchorDay);
    const targetDay = Number.isInteger(requestedAnchor) && requestedAnchor >= 1 && requestedAnchor <= 31
      ? requestedAnchor
      : current.getUTCDate();
    current.setUTCDate(1);
    current.setUTCMonth(current.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0, 12)).getUTCDate();
    current.setUTCDate(Math.min(targetDay, lastDay));
    return isoDate(current);
  }
  return null;
}

export function recurrenceAllowed(serviceSlug, frequency) {
  const service = getHomeService(serviceSlug);
  return Boolean(service && service.recurrence.includes(frequency));
}
