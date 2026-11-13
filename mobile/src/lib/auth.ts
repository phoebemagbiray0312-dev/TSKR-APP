import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Real "Continue with Google" via Supabase Auth (PKCE).
 * Needs: Supabase › Authentication › Providers › Google enabled (company Google Cloud OAuth client),
 * and the redirect URL below added to Supabase › Authentication › URL Configuration.
 */
export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('/auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web', queryParams: { prompt: 'select_account' } },
  });
  if (error) throw new Error(error.message);
  if (Platform.OS === 'web') return; // browser redirects by itself
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') throw new Error('Google sign-in was cancelled.');
  const code = new URL(res.url).searchParams.get('code');
  if (!code) throw new Error('Google sign-in failed. Please try again.');
  const { error: e2 } = await supabase.auth.exchangeCodeForSession(code);
  if (e2) throw new Error(e2.message);
}

/**
 * TESTING ONLY (EXPO_PUBLIC_DEMO_AUTH=true): sign in a demo "Google account" with email + fixed password.
 * Needs Supabase › Authentication › Email: "Confirm email" turned OFF.
 */
const DEMO_PASSWORD = 'tskr-demo-2026!';
export async function signInDemo(email: string, fullName: string) {
  const r = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (!r.error) return;
  const s = await supabase.auth.signUp({ email, password: DEMO_PASSWORD, options: { data: { full_name: fullName } } });
  if (s.error) throw new Error(s.error.message);
  if (!s.data.session) throw new Error('Turn off "Confirm email" in Supabase Auth settings to use demo accounts.');
}
