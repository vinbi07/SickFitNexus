import { assertSupabase } from "@/lib/supabase";

export async function listTable<T>(table: string, orderBy = "created_at", ascending = false) {
  const supabase = assertSupabase();
  const { data, error } = await supabase.from(table as never).select("*").order(orderBy, { ascending });
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function upsertTable<T>(table: string, payload: Partial<T> | Partial<T>[]) {
  const supabase = assertSupabase();
  const { data, error } = await supabase.from(table as never).upsert(payload as never).select();
  if (error) throw error;
  return data;
}

export async function insertTable<T>(table: string, payload: Partial<T> | Partial<T>[]) {
  const supabase = assertSupabase();
  const { data, error } = await supabase.from(table as never).insert(payload as never).select();
  if (error) throw error;
  return data;
}

export async function updateTable<T>(
  table: string,
  id: string,
  payload: Partial<T>,
) {
  const supabase = assertSupabase();
  const { data, error } = await supabase.from(table as never).update(payload as never).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFromTable(table: string, id: string) {
  const supabase = assertSupabase();
  const { error } = await supabase.from(table as never).delete().eq("id", id);
  if (error) throw error;
}
