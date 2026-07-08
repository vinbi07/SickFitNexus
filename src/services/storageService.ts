import { assertSupabase } from "@/lib/supabase";

const BUCKET = "manufacturer-files";

export type UploadFolder = "mockups" | "artwork" | "retailer-logos" | "products";

export async function uploadManufacturerFile(
  file: File,
  folder: UploadFolder,
): Promise<string> {
  const supabase = assertSupabase();

  const ext = file.name.split(".").pop() ?? "bin";
  const timestamp = Date.now();
  const safe = file.name.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  const path = `${folder}/${timestamp}_${safe}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
