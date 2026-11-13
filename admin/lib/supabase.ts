import { createClient } from '@supabase/supabase-js';

// Public (publishable) key: safe in the browser. Access is enforced by RLS + is_admin() in the database.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kgewevgkqxvwdwaxizri.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'sb_publishable_bYP2SCXqeQxobW31HUGnwA_aqmJBJor';
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });

export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const peso = (n: number | string | null | undefined) => '₱' + Math.round(Number(n || 0)).toLocaleString('en-PH');
export const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
