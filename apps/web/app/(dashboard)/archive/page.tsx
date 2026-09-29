import type { Metadata } from "next";
import { ArchiveClient } from "./ArchiveClient";

export const metadata: Metadata = {
  title: "Archive — Blue Beacon Research",
  description:
    "Look up older signals by date, commodity desk, region, or keyword. No severity floor and no recency cutoff.",
};

export default function ArchivePage() {
  return <ArchiveClient />;
}
