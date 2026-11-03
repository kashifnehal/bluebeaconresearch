import type { NextRequest } from "next/server";
import { handleLeadsPost } from "@/lib/leads-handler";

// Logic lives in lib/leads-handler.ts so tests can inject fakes there.
export async function POST(req: NextRequest) {
  return handleLeadsPost(req);
}
