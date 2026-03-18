import { getAccessToken } from "./supabase";
import { getApiUrl } from "./config";

export async function geoFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const apiUrl = getApiUrl();
  const token = await getAccessToken();

  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

