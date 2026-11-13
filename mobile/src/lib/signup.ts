import AsyncStorage from '@react-native-async-storage/async-storage';
import { rpc, Role, supabase } from './supabase';
import Constants from 'expo-constants';

/**
 * Consent is given on the Welcome screen, BEFORE the account exists (Guide §2.3).
 * We keep what was accepted (role + versions + time) on the phone, then send it to the
 * server right after Google sign-in. Switching the role card clears it.
 */
const KEY = 'tskr.pendingConsent';

export type PendingConsent = { role: Role; termsVersion: string; privacyVersion: string; acceptedAt: string };

export async function savePendingConsent(c: PendingConsent) {
  await AsyncStorage.setItem(KEY, JSON.stringify(c));
}
export async function readPendingConsent(): Promise<PendingConsent | null> {
  const s = await AsyncStorage.getItem(KEY);
  return s ? (JSON.parse(s) as PendingConsent) : null;
}
export async function clearPendingConsent() {
  await AsyncStorage.removeItem(KEY);
}

/** After login: store consents on the server (once). */
export async function flushPendingConsent() {
  const c = await readPendingConsent();
  if (!c) return;
  const { count } = await supabase.from('consents').select('id', { count: 'exact', head: true });
  if (!count) {
    await rpc('record_signup_consents', {
      p_role: c.role,
      p_terms_version: c.termsVersion,
      p_privacy_version: c.privacyVersion,
      p_app_version: Constants.expoConfig?.version ?? null,
    });
  }
  await clearPendingConsent();
}

export type PolicyDoc = {
  id: string;
  doc_type: 'terms' | 'privacy' | 'id_consent';
  role: Role;
  version: string;
  title: string;
  effective_date: string;
  sections: { h: string; p: string }[];
};

export async function loadPolicies(role: Role): Promise<{ terms: PolicyDoc; privacy: PolicyDoc }> {
  const { data, error } = await supabase
    .from('policy_documents')
    .select('*')
    .eq('role', role)
    .eq('is_current', true)
    .in('doc_type', ['terms', 'privacy']);
  if (error) throw new Error(error.message);
  const docs = data as PolicyDoc[];
  return { terms: docs.find((d) => d.doc_type === 'terms')!, privacy: docs.find((d) => d.doc_type === 'privacy')! };
}

/** Where should a signed-in user resume the sign-up? (Steps: account, name, email, phone, otp) */
export function nextSignupRoute(p: { email_verified_at: string | null; phone_verified_at: string | null }) {
  if (!p.email_verified_at) return '/(auth)/name';
  if (!p.phone_verified_at) return '/(auth)/phone';
  return '/(auth)/done';
}

export const digits = (v: string) => (v || '').replace(/\D/g, '');
export const maskEmail = (e: string) => {
  const [u, d] = e.split('@');
  return u.slice(0, 2) + '*'.repeat(Math.max(1, u.length - 2)) + '@' + d;
};
export const fmtPhone = (ph: string) => (ph.length === 10 ? `${ph.slice(0, 3)} ${ph.slice(3, 6)} ${ph.slice(6)}` : ph);
export const maskPhone = (ph: string) => (ph.length === 10 ? `+63 ${ph.slice(0, 3)} *** ${ph.slice(6)}` : `+63 ${ph}`);
