import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type ResolvedLocality = GeoPoint & {
  province: string;
  locality: string;
  formattedAddress: string | null;
  provider: "geoapify";
  cached: boolean;
};

const geoapifySchema = z.object({
  results: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    formatted: z.string().max(500).optional(),
  })).min(1),
});

export class GeocodingUnavailableError extends Error {
  constructor(message = "El servicio de geolocalización no está disponible.") {
    super(message);
    this.name = "GeocodingUnavailableError";
  }
}

export class LocalityNotFoundError extends Error {
  constructor() {
    super("No hemos podido validar esa localidad dentro de España.");
    this.name = "LocalityNotFoundError";
  }
}

export function normalizeAreaKey(province: string, locality: string) {
  return `${province.trim().toLocaleLowerCase("es-ES")}|${locality.trim().toLocaleLowerCase("es-ES")}`;
}

const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function haversineDistanceKm(origin: GeoPoint, destination: GeoPoint) {
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceLocationScore(distanceKm: number, radiusKm: number) {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(radiusKm) || radiusKm <= 0 || distanceKm > radiusKm) return 0;
  const ratio = distanceKm / radiusKm;
  if (ratio <= 0.25) return 100;
  if (ratio <= 0.50) return 90;
  if (ratio <= 0.75) return 80;
  return 70;
}

async function persistResolvedLocation(database: Database, resolved: Omit<ResolvedLocality, "cached">) {
  const areaKey = normalizeAreaKey(resolved.province, resolved.locality);
  await database.query(
    `INSERT INTO geo_location_cache
      (area_key, province, locality, latitude, longitude, formatted_address, provider, resolved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (area_key) DO UPDATE SET
       province=EXCLUDED.province,
       locality=EXCLUDED.locality,
       latitude=EXCLUDED.latitude,
       longitude=EXCLUDED.longitude,
       formatted_address=EXCLUDED.formatted_address,
       provider=EXCLUDED.provider,
       resolved_at=now()`,
    [areaKey, resolved.province, resolved.locality, resolved.latitude, resolved.longitude, resolved.formattedAddress, resolved.provider],
  );
  await database.query(
    `UPDATE users
        SET service_latitude=$3, service_longitude=$4, service_geocoded_at=now(), updated_at=now()
      WHERE lower(btrim(service_province))=lower(btrim($1))
        AND lower(btrim(service_locality))=lower(btrim($2))`,
    [resolved.province, resolved.locality, resolved.latitude, resolved.longitude],
  );
  await database.query(
    `UPDATE projects
        SET latitude=$3, longitude=$4, geocoded_at=now(), updated_at=now()
      WHERE lower(btrim(service_province))=lower(btrim($1))
        AND lower(btrim(service_locality))=lower(btrim($2))`,
    [resolved.province, resolved.locality, resolved.latitude, resolved.longitude],
  );
}

export async function resolveSpainLocality(
  database: Database,
  config: AppConfig,
  input: { province: string; locality: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedLocality> {
  const province = input.province.trim();
  const locality = input.locality.trim();
  const areaKey = normalizeAreaKey(province, locality);
  const cached = await database.query<{
    province: string;
    locality: string;
    latitude: number | string;
    longitude: number | string;
    formatted_address: string | null;
  }>(
    `SELECT province, locality, latitude, longitude, formatted_address
       FROM geo_location_cache WHERE area_key=$1`,
    [areaKey],
  );
  const cachedRow = cached.rows[0];
  if (cachedRow) {
    return {
      province: cachedRow.province,
      locality: cachedRow.locality,
      latitude: Number(cachedRow.latitude),
      longitude: Number(cachedRow.longitude),
      formattedAddress: cachedRow.formatted_address,
      provider: "geoapify",
      cached: true,
    };
  }

  if (!config.GEOAPIFY_API_KEY) throw new GeocodingUnavailableError("Falta configurar la geolocalización de MiConstructor.");

  const endpoint = new URL("https://api.geoapify.com/v1/geocode/search");
  endpoint.searchParams.set("text", `${locality}, ${province}, España`);
  endpoint.searchParams.set("lang", "es");
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("type", "city");
  endpoint.searchParams.set("filter", "countrycode:es");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("apiKey", config.GEOAPIFY_API_KEY);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(4500), headers: { accept: "application/json" } });
  } catch {
    throw new GeocodingUnavailableError();
  }
  if (!response.ok) throw new GeocodingUnavailableError();
  const parsed = geoapifySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new LocalityNotFoundError();
  const best = parsed.data.results[0];
  if (!best) throw new LocalityNotFoundError();

  const resolved = {
    province,
    locality,
    latitude: best.lat,
    longitude: best.lon,
    formattedAddress: best.formatted ?? null,
    provider: "geoapify" as const,
  };
  await persistResolvedLocation(database, resolved);
  return { ...resolved, cached: false };
}
