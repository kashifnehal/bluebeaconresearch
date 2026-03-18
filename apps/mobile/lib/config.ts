import Constants from "expo-constants";

export const appExtra = Constants.expoConfig?.extra ?? {};

export function getApiUrl() {
  const v = appExtra.API_URL;
  return typeof v === "string" && v.length ? v : "http://localhost:3001";
}

export function getSupabaseConfig() {
  return {
    url: (appExtra.SUPABASE_URL as string | undefined) ?? "",
    anonKey: (appExtra.SUPABASE_ANON_KEY as string | undefined) ?? "",
  };
}

