import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/watchlist", "/alerts", "/backtesting", "/api-console", "/settings"] }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

