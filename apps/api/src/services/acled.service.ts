import axios from "axios";
import { getEnv } from "../env";

export class AcledService {
  private token: string | null = null;
  private tokenExpiry: number = 0;

  async getAccessToken() {
    const env = getEnv();
    if (!env.ACLED_EMAIL || !env.ACLED_PASSWORD) {
      throw new Error("ACLED credentials missing in .env");
    }

    // If token exists and is not expired (with 1 min buffer)
    if (this.token && Date.now() < this.tokenExpiry - 60000) {
      return this.token;
    }

    try {
      // Current ACLED OAuth/Access generation pattern
      const resp = await axios.post("https://api.acleddata.com/api/auth/login", {
        email: env.ACLED_EMAIL,
        password: env.ACLED_PASSWORD,
      }, { timeout: 10000 });

      // Assuming standard OAuth response or custom ACLED token field
      this.token = resp.data?.access_token || resp.data?.token || null;
      // Tokens usually last 24h, we set a safe expiry if not provided
      this.tokenExpiry = Date.now() + (resp.data?.expires_in ? resp.data.expires_in * 1000 : 3600 * 1000);
      
      return this.token;
    } catch (e) {
      console.error("ACLED Login Failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }

  async fetchRecentEvents() {
    const token = await this.getAccessToken();
    if (!token) return [];

    try {
      // Fetch political violence and protest events
      const resp = await axios.get("https://api.acleddata.com/acled/read", {
        params: {
          limit: 100,
          order: "event_date:desc",
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 20000
      });

      return resp.data?.data ?? [];
    } catch (e) {
      console.error("ACLED Fetch Failed:", e instanceof Error ? e.message : e);
      return [];
    }
  }
}
