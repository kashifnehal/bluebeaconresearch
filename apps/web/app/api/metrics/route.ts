import { NextResponse } from "next/server";
import { getAll } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET() {
  // Expose metrics only in non-production to avoid leaking sensitive info.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(getAll());
}
