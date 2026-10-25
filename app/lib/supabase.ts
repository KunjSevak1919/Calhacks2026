import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export interface ProfileData {
  full_name: string | null;
  school: string | null;
  payday: string | null;
  pay_frequency: string | null;
}

export async function getProfile(): Promise<ProfileData | null> {
  if (!supabase) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, school, payday, pay_frequency")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (error) return null;
    return (data as ProfileData | null);
  } catch {
    return null;
  }
}
