import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getPublishedAssessmentBySlug } from "@/lib/public-assessments";

export const alt = "Blue Beacon Research";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadMark(): Promise<string | null> {
  try {
    const bytes = await readFile(join(process.cwd(), "public/brand/mark-white.png"));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function AssessmentOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [assessment, mark] = await Promise.all([getPublishedAssessmentBySlug(slug), loadMark()]);
  const headline = assessment?.headline ?? "Blue Beacon Research";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0A2643",
          color: "#ffffff",
          padding: "72px",
        }}
      >
        {mark ? (
          // Satori requires width and height on img. The file is the local brand mark.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mark} width={72} height={72} alt="" />
        ) : null}
        <div
          style={{
            display: "-webkit-box",
            fontSize: 64,
            marginTop: 36,
            lineHeight: 1.2,
            maxWidth: 1000,
            overflow: "hidden",
            textOverflow: "ellipsis",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {headline}
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: "auto" }}>Blue Beacon Research</div>
      </div>
    ),
    { ...size },
  );
}
