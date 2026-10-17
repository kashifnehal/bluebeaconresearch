import { NextResponse } from "next/server";

// Must stay free of other services so an outage in them does not report the web function as down.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
