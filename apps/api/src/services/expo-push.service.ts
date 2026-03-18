import axios from "axios";

export class ExpoPushService {
  async send(to: string, title: string, body: string, data?: Record<string, unknown>) {
    // Expo push endpoint is public; auth is not required.
    const res = await axios.post(
      "https://exp.host/--/api/v2/push/send",
      { to, title, body, data },
      { timeout: 15_000 },
    );
    return res.data;
  }
}

