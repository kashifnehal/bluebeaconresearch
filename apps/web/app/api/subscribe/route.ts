import type { NextRequest } from "next/server";
import { handleSubscribePost } from "@/lib/subscribe-handler";

// Logic lives in lib/subscribe-handler.ts so tests can inject fakes there.
export async function POST(req: NextRequest) {
  return handleSubscribePost(req);
}
