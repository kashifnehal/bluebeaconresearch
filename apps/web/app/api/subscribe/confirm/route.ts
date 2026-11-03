import type { NextRequest } from "next/server";
import { handleSubscribeConfirmGet } from "@/lib/subscribe-confirm-handler";

// Logic lives in lib/subscribe-confirm-handler.ts so tests can inject fakes there.
export async function GET(req: NextRequest) {
  return handleSubscribeConfirmGet(req);
}
