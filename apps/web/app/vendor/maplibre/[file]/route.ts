import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { mapLibreAssetPath } from "@/lib/maplibre-asset";

export async function GET(
  _req: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  const assetPath = mapLibreAssetPath(file);
  if (!assetPath) {
    return new NextResponse(null, { status: 404 });
  }
  const body = readFileSync(assetPath);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
