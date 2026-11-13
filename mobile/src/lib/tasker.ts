import { rpc, supabase } from './supabase';

export type Req = {
  id: string; code: string; created_at: string; when_type: 'now' | 'scheduled'; scheduled_at: string | null;
  client: string; area: string; km: number | null; total: number; repeat: boolean; delivery: boolean; service: string;
};
export type ActiveJob = { id: string; code: string; status: string; client: string; area: string; total: number; service: string };
export type TaskerHome = {
  full_name: string; short_name: string; nickname: string | null; photo: string | null; online: boolean; radius_km: number;
  area_label: string | null; base_set: boolean; qr_status: 'none' | 'pending' | 'approved' | 'rejected'; require_qr: boolean;
  rating: number; rating_count: number; jobs_done: number; coins: number; fee: number; repeat_fee: number;
  skills: number; skills_pending: number; today_jobs: number; today_earned: number; requests: Req[]; active: ActiveJob[];
};

export const STATUS_LABEL: Record<string, string> = {
  requested: 'New request', chatting: 'Chatting', offer_sent: 'Offer sent', offer_accepted: 'Offer accepted',
  on_the_way: 'On the way', arrived: 'Arrived', final_price_sent: 'Final price sent', ready: 'Ready to start',
  in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', declined_by_tasker: 'Declined',
};

export const loadTaskerHome = () => rpc<TaskerHome>('tasker_home');

/** Upload a picked/taken image to Storage and return its path. */
export async function uploadImage(bucket: string, folder: string, uri: string, name: string) {
  const path = `${folder}/${name}-${Date.now()}.jpg`;
  const buf = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

export const coins = (n: number) => `${Math.round(n).toLocaleString('en-PH')} coins`;
