import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseUrl = rawUrl.startsWith("https://") ? rawUrl : "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

export const supabaseServer = createClient<Database>(supabaseUrl, supabaseServiceKey);
