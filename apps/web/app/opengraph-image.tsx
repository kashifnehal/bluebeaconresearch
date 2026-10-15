import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SHARE_DESCRIPTION, SHARE_TITLE } from "@/lib/site-metadata";

export const alt = SHARE_TITLE;
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

export default async function OpenGraphImage() {
  const mark = await loadMark();
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
        <div style={{ display: "flex", fontSize: 64, marginTop: 36 }}>{SHARE_TITLE}</div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 20 }}>AI-powered research platform</div>
        <div style={{ display: "flex", fontSize: 28, marginTop: 24, maxWidth: 980 }}>{SHARE_DESCRIPTION}</div>
        <div style={{ display: "flex", fontSize: 22, marginTop: "auto" }}>Research, not investment advice.</div>
      </div>
    ),
    { ...size },
  );
}
