import { getEnv } from "../env.js";
import { describeError } from "./safe-error-text.js";

const RESTART_TIMEOUT_MS = 15_000;

function deriveProjectRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const first = host.split(".")[0];
    return first || null;
  } catch {
    return null;
  }
}

export type SupabaseRestartDeps = {
  fetchImpl?: typeof fetch;
  token?: string;
  projectRef?: string;
};

export type SupabaseRestartResult = { ok: boolean; status?: number; error?: string };

/**
 * Asks the Supabase Management API to restart this project. Never throws, and
 * never logs, returns, or emails the access token itself — only describeError()'d
 * failure text, which does not include request headers.
 */
export async function requestSupabaseRestart(
  deps: SupabaseRestartDeps = {},
): Promise<SupabaseRestartResult> {
  try {
    const env = getEnv();
    const token = deps.token ?? env.SUPABASE_ACCESS_TOKEN;
    if (!token) {
      return { ok: false, error: "missing SUPABASE_ACCESS_TOKEN" };
    }

    const projectRef = deps.projectRef ?? deriveProjectRef(env.SUPABASE_URL);
    if (!projectRef) {
      return { ok: false, error: "could not derive project ref from SUPABASE_URL" };
    }

    const fetchImpl = deps.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESTART_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/restart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        return { ok: false, status: res.status, error: `restart request failed (HTTP ${res.status})` };
      }
      return { ok: true, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
