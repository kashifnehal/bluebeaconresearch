import type { NextRequest } from "next/server";
import { handleEventsPost } from "@/lib/events-post-handler";

// Next.js allows only HTTP-method exports from a route file, and a handler may
// take only (request, context). The logic lives in lib/events-post-handler.ts
// so tests can inject fakes there.
export async function POST(req: NextRequest) {
  return handleEventsPost(req);
}
