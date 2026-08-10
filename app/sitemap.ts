import type { MetadataRoute } from "next";
import { LOCAL_SEO_PARAMS } from "@/lib/local-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://miconstructor.es";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...LOCAL_SEO_PARAMS.flatMap(({ service, city }) => [
      { url: `${base}/${service}/${city}`, changeFrequency: "weekly" as const, priority: 0.8 },
      { url: `${base}/precios/${service}/${city}`, changeFrequency: "monthly" as const, priority: 0.7 },
    ]),
  ];
}
