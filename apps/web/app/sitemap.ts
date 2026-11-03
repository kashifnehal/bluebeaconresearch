import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-metadata";
import { getPublishedAssessments } from "@/lib/public-assessments";

type Deps = { getAssessments: typeof getPublishedAssessments };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap();
}

// Next's typed-route check requires this file's default export to match its exact generated
// signature, so the injectable-deps parameter lives on this separately exported function
// instead (same reason as lib/*-handler.ts's `override?` pattern).
export async function buildSitemap(deps?: Partial<Deps>): Promise<MetadataRoute.Sitemap> {
  const getAssessments = deps?.getAssessments ?? getPublishedAssessments;
  const base = SITE_ORIGIN;

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/how-it-works`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/accuracy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/status`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/assessments`, lastModified: new Date(), changeFrequency: "daily", priority: 0.4 },
    { url: `${base}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/walkthrough`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/subscribe`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.1 },
  ];

  let assessmentEntries: MetadataRoute.Sitemap = [];
  try {
    const items = await getAssessments();
    assessmentEntries = items.map((a) => ({
      url: `${base}/assessments/${a.slug}`,
      lastModified: new Date(a.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    }));
  } catch {
    // A DB read failure returns the static entries only — never breaks the sitemap.
    assessmentEntries = [];
  }

  return [...staticEntries, ...assessmentEntries];
}
