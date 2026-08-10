import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/demo", "/api/"] }, sitemap: "https://miconstructor.es/sitemap.xml" };
}
