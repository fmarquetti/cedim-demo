import { supabase } from "../lib/supabaseClient";

export async function getUserPreference(userId, preferenceKey) {
  if (!userId || !preferenceKey) return null;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("preference_value")
    .eq("user_id", userId)
    .eq("preference_key", preferenceKey)
    .maybeSingle();

  if (error) throw error;

  return data?.preference_value || null;
}

export async function saveUserPreference(userId, preferenceKey, preferenceValue) {
  if (!userId || !preferenceKey) return null;

  const payload = {
    user_id: userId,
    preference_key: preferenceKey,
    preference_value: preferenceValue || {},
  };

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(payload, { onConflict: "user_id,preference_key" })
    .select("preference_value")
    .single();

  if (error) throw error;

  return data?.preference_value || null;
}
