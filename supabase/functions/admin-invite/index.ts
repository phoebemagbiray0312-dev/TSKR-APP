// Superadmin invites someone to the TSKR admin panel. Supabase emails them an invite link;
// they open it and set their own password on the admin site. Nobody else ever sees the password.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
// Only these sites may receive the invite link (they must also be in Supabase › URL Configuration).
const ALLOWED = ['https://tskr-admin.vercel.app'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    const { email, role, first_name, last_name, origin, resend } = await req.json();

    // Act as the caller: the database checks they are a superadmin and records the invite.
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: result, error } = await asCaller.rpc('admin_invite', {
      p_email: email, p_role: role, p_first: first_name || null, p_last: last_name || null,
    });
    if (error) return json({ error: error.message }, 400);
    if (result === 'added' && !resend) return json({ result: 'added' });

    const site = ALLOWED.includes(origin) ? origin : ALLOWED[0];
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(String(email).trim().toLowerCase(), {
      redirectTo: `${site}/?setpw=1`,
      data: { full_name: [first_name, last_name].filter(Boolean).join(' ') || 'TSKR Admin' },
    });
    if (invErr) {
      // Has a login that isn't confirmed yet, or already has one: tell the superadmin plainly.
      const msg = /already been registered|already registered|exists/i.test(invErr.message)
        ? 'This email already has a TSKR login. Ask them to sign in and use “Forgot password?” if needed. Their admin access starts once their email is confirmed.'
        : invErr.message;
      return json({ result: 'invited_no_email', warning: msg });
    }
    return json({ result: 'invited' });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
