import type { Metadata } from "next";

/** Canonical host. https://bluebeaconresearch.com redirects here (checked 2026-10-15). */
export const SITE_ORIGIN = "https://www.bluebeaconresearch.com";

export const SHARE_TITLE = "Blue Beacon Research";

export const SHARE_DESCRIPTION = "Geopolitical events, structured for the commodity markets you follow.";

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "Blue Beacon Research",
  description: "Geopolitical intelligence for markets that matter.",
  openGraph: {
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    siteName: SHARE_TITLE,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
};
