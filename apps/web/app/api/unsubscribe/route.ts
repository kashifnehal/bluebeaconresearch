import type { NextRequest } from "next/server";
import { handleUnsubscribeGet, handleUnsubscribePost } from "@/lib/unsubscribe-handler";

// Logic lives in lib/unsubscribe-handler.ts so tests can inject fakes there.
export async function GET(req: NextRequest) {
  return handleUnsubscribeGet(req);
}

export async function POST(req: NextRequest) {
  return handleUnsubscribePost(req);
}
