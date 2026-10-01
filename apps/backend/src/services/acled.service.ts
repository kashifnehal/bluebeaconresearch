import axios from "axios";
import { getEnv } from "../env.js";

// Per ACLED's current docs (2026-10-01):
// https://acleddata.com/api-documentation/getting-started
// https://acleddata.com/api-documentation/acled-endpoint
// The old api.acleddata.com host does not resolve (DNS failure) — ACLED moved
// auth + reads under acleddata.com itself.
const ACLED_TOKEN_URL = "https://acleddata.com/oauth/token";
const ACLED_READ_URL = "https://acleddata.com/api/acled/read";

// How far back to pull on every poll. ACLED's read endpoint has no documented
// pagination; raw_events dedup on external_id (event_id_cnty) makes re-fetching
// the same window on every run harmless.
const LOOKBACK_DAYS = 7;

export interface AcledEvent {
  event_id_cnty?: string;
  event_date?: string;
  year?: string | number;
  event_type?: string;
  sub_event_type?: string;
  actor1?: string;
  actor2?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  fatalities?: string | number;
  notes?: string;
  region?: string;
  iso?: string;
  disorder_type?: string;
  interaction?: string;
  [key: string]: unknown;
}

/**
 * Thrown when the data read returns HTTP 403 (login worked, the account has no
 * API data access). The collector uses this to back off instead of retrying every
 * ingestion cycle. Matching on the type, not on message text, keeps that logic
 * from breaking if the wording changes.
 */
export class AcledAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcledAccessDeniedError";
  }
}

// Exported for tests only.
export function describeAxiosError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    const statusText = e.response?.statusText;
    let msg = status ? `HTTP ${status}${statusText ? ` ${statusText}` : ""}` : e.message;
    if (e.response) {
      // ACLED's 403 body is JSON ({"message":"Access denied"}); axios parses it to an
      // object, and String(object) logs "[object Object]". Stringify objects instead.
      const rawBody = e.response.data;
      const bodyText =
        rawBody !== null && typeof rawBody === "object"
          ? JSON.stringify(rawBody)
          : String(rawBody);
      const body = bodyText.replace(/\r?\n/g, " ").slice(0, 200);
      msg += ` | body: ${body}`;
      const server = e.response.headers?.["server"];
      if (server) msg += ` | server: ${server}`;
      const cfRay = e.response.headers?.["cf-ray"];
      if (cfRay) msg += ` | cf-ray: ${cfRay}`;
    }
    return msg;
  }
  return e instanceof Error ? e.message : String(e);
}

// Identifies calls to ACLED so a 403 that reproduces only off the founder's
// laptop (e.g. Railway's egress IP/ASN blocked by Cloudflare) shows up as such
// server-side, instead of looking identical to a bad-credentials 403.
const ACLED_REQUEST_HEADERS = {
  "User-Agent": "BlueBeaconResearch/1.0 (contact: bluebeaconresearch@gmail.com)",
  Accept: "application/json",
};

export class AcledService {
  private token: string | null = null;
  private tokenExpiry = 0;

  /** Throws on missing credentials or a failed/invalid login — never returns null. */
  async getAccessToken(): Promise<string> {
    const env = getEnv();
    if (!env.ACLED_EMAIL || !env.ACLED_PASSWORD) {
      throw new Error("ACLED credentials missing in .env");
    }

    if (this.token && Date.now() < this.tokenExpiry - 60_000) {
      return this.token;
    }

    let resp;
    try {
      resp = await axios.post(
        ACLED_TOKEN_URL,
        new URLSearchParams({
          username: env.ACLED_EMAIL,
          password: env.ACLED_PASSWORD,
          grant_type: "password",
          client_id: "acled",
          scope: "authenticated",
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...ACLED_REQUEST_HEADERS,
          },
          timeout: 10_000,
        },
      );
    } catch (e) {
      throw new Error(`ACLED login failed: ${describeAxiosError(e)}`);
    }

    const accessToken = resp.data?.access_token;
    if (!accessToken || typeof accessToken !== "string") {
      throw new Error("ACLED login failed: no access_token in response");
    }

    this.token = accessToken;
    const expiresInSeconds =
      typeof resp.data?.expires_in === "number" ? resp.data.expires_in : 86_400;
    this.tokenExpiry = Date.now() + expiresInSeconds * 1000;

    return this.token;
  }

  /** Throws on a failed/non-2xx or unsuccessful read — never swallows errors into []. */
  async fetchRecentEvents(): Promise<AcledEvent[]> {
    const token = await this.getAccessToken();

    const sinceDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    let resp;
    try {
      resp = await axios.get(ACLED_READ_URL, {
        params: {
          _format: "json",
          event_date: sinceDate,
          event_date_where: ">",
        },
        headers: {
          Authorization: `Bearer ${token}`,
          ...ACLED_REQUEST_HEADERS,
        },
        timeout: 20_000,
      });
    } catch (e) {
      const text = `ACLED read failed: ${describeAxiosError(e)}`;
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        throw new AcledAccessDeniedError(text);
      }
      throw new Error(text);
    }

    if (resp.data?.success !== true) {
      const messages = resp.data?.messages;
      const detail = Array.isArray(messages)
        ? messages.join("; ")
        : messages
          ? String(messages)
          : `unexpected response (status=${resp.data?.status ?? "unknown"})`;
      throw new Error(`ACLED read failed: ${detail}`);
    }

    return Array.isArray(resp.data?.data) ? (resp.data.data as AcledEvent[]) : [];
  }
}
