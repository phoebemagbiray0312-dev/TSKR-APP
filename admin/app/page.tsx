'use client';
import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { peso, rpc, supabase, when } from '../lib/supabase';

type Tab = 'overview' | 'revenue' | 'applications' | 'reviews' | 'tickets' | 'strikes' | 'fees' | 'bookings' | 'users' | 'access' | 'team' | 'settings' | 'profile';
type Overview = Record<string, number | boolean>;
type Me = { id: string; email: string; first_name: string; last_name: string; phone: string | null; role: string; photo: string | null };

/* simple line icons (24px grid) */
const ICON: Record<string, string> = {
  overview: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  applications: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11l2 2 4-4',
  reviews: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3 2 2 4-4',
  tickets: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
  revenue: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  bookings: 'M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4',
  strikes: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 6 0',
  fees: 'M3 7h18v10H3V7Zm9 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 10v4m12-4v4',
  access: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6m2-6c3.3 0 6 2.7 6 6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3 2-1-2-4-2 1-2-2V4h-4v2L9 7 7 6 5 10l2 1v2l-2 1 2 4 2-1 2 2v2h4v-2l2-2 2 1 2-4-2-1v-2Z',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9c0-3.3 2.7-6 6-6 1.6 0 3 .6 4 1.6M18 13v8m-4-4h8',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9c0-4.4 3.6-8 8-8s8 3.6 8 8',
  coins: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3-12.5c-.6-.9-1.7-1.5-3-1.5-1.9 0-3 1-3 2.3 0 3 6 1.6 6 4.6 0 1.3-1.3 2.3-3 2.3-1.4 0-2.6-.6-3.2-1.6M12 5.5v1.5m0 10v1.5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5',
};
const Icon = ({ name, size = 18 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICON[name]} />
  </svg>
);
const NAV: Partial<Record<Tab, string>> = { applications: 'Applications', reviews: 'QR and skills', tickets: 'Reports and SOS', strikes: 'Strikes, pauses and suspensions', fees: 'Cancellation fees', access: 'ID access log' };
const initials = (m: Me | null) => ((m?.first_name?.[0] ?? '') + (m?.last_name?.[0] ?? '')).toUpperCase() || 'A';
const TITLES: Record<Tab, string> = {
  overview: 'Overview', revenue: 'Revenue', applications: 'Tasker applications', reviews: 'QR and skill reviews', tickets: 'Reports and SOS',
  strikes: 'Strikes, pauses and suspensions', fees: 'Cancellation fees', access: 'ID access log',
  bookings: 'Bookings', users: 'Users', team: 'Admins', settings: 'Settings', profile: 'My profile',
};

/** Same header logo as the app: three white dots that keep "typing" (1.4s loop, 0.18s apart). */
function BrandLogo({ height, dark, style }: { height: number; dark?: boolean; style?: React.CSSProperties }) {
  return (
    <span className="brandlogo" style={{ height, width: height * (350 / 96), ...style }}>
      <img src={dark ? '/logo-dark.png' : '/logo.png'} alt="tskr" />
      {[13.1, 18.85, 24.55].map((l, i) => <i key={i} style={{ left: `${l}%`, animationDelay: `${i * 0.18}s`, background: dark ? '#044D5E' : '#FFFFFF' }} />)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Admin shell: login gate + sidebar                                    */
/* ------------------------------------------------------------------ */
export default function Admin() {
  const [state, setState] = useState<'loading' | 'out' | 'setpw' | 'notadmin' | 'in'>('loading');
  const [email, setEmail] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [ov, setOv] = useState<Overview | null>(null);
  const [preset, setPreset] = useState('');
  const go = (t: Tab, f = '') => { setPreset(f); setTab(t); };

  const loadMe = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('first_name,last_name,phone').eq('id', u.user.id).maybeSingle(),
      supabase.from('admin_users').select('role,photo_path').eq('user_id', u.user.id).maybeSingle(),
    ]);
    setMe({ id: u.user.id, email: u.user.email ?? '', first_name: p?.first_name ?? '', last_name: p?.last_name ?? '', phone: p?.phone ?? null, role: a?.role ?? 'admin', photo: a?.photo_path ?? null });
  }, []);
  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setState('out');
    setEmail(data.session.user.email ?? '');
    // opened from an invite or "forgot password" email: choose a password first
    if (new URLSearchParams(window.location.search).get('setpw') === '1') return setState('setpw');
    let { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      // invited by a superadmin? the role is given once the email is confirmed
      const { data: claimed } = await supabase.rpc('claim_admin_invite');
      if (claimed) isAdmin = true;
    }
    if (isAdmin) loadMe();
    setState(isAdmin ? 'in' : 'notadmin');
  }, []);
  useEffect(() => { check(); }, []);
  const loadOv = useCallback(async () => { try { setOv(await rpc<Overview>('admin_overview')); } catch { /* not admin */ } }, []);
  useEffect(() => { if (state === 'in') loadOv(); }, [state, tab]);
  const signOut = async () => { await supabase.auth.signOut(); setMe(null); setState('out'); };

  if (state === 'loading') return <div className="login"><p className="muted">Loading…</p></div>;
  if (state === 'out') return <Login onDone={check} />;
  if (state === 'setpw') return <SetPassword email={email} onDone={() => { window.history.replaceState(null, '', window.location.pathname); check(); }} />;
  if (state === 'notadmin') return (
    <div className="login"><div className="card">
      <BrandLogo height={30} dark style={{ alignSelf: 'flex-start' }} />
      <h2>No admin access yet</h2>
      <p className="muted">Signed in as <b>{email}</b>. Ask a superadmin to invite this email under <b>Admins</b>. They’ll get an email with a link to set up their admin login.</p>
      <button className="btn" onClick={signOut}>Sign out</button>
    </div></div>
  );

  const n = (k: string) => Number(ov?.[k] ?? 0);
  const items: [Tab, number?][] = [
    ['overview'], ['revenue'], ['applications', n('applications')], ['reviews', n('qr_pending') + n('skills_pending')],
    ['tickets', n('tickets_open')], ['strikes'], ['fees'], ['bookings'], ['users'], ['access'], ['team'], ['settings'],
  ];
  const name = me ? `${me.first_name} ${me.last_name}`.trim() || me.email : email;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><BrandLogo height={34} /><span className="badge">ADMIN</span></div>
        <div className="navlist">
          {items.map(([k, c]) => (
            <button key={k} className={'nav' + (tab === k ? ' on' : '')} onClick={() => go(k)}>
              <Icon name={k} /><span className="lbl">{NAV[k] ?? TITLES[k]}</span>{c ? <span className="count">{c}</span> : null}
            </button>
          ))}
        </div>
        <button className={'me' + (tab === 'profile' ? ' on' : '')} onClick={() => setTab('profile')}>
          <Avatar path={me?.photo} text={initials(me)} />
          <span className="who"><b>{name}</b><small>{me?.role ?? 'admin'}</small></span>
        </button>
        <button className="signout" onClick={signOut}>Sign out</button>
      </aside>
      <main>
        <div className="wrap">
          <header className="top">
            <h1>{TITLES[tab]}</h1>
            <button className="chip" onClick={() => setTab('profile')}><Avatar path={me?.photo} text={initials(me)} size="sm" />{name}</button>
          </header>
          {ov && (tab === 'overview' || tab === 'settings') && (ov.demo_mode || ov.payments_demo) ? <div className="note" style={{ marginBottom: 16 }}>TEST BUILD: demo codes and demo payments are ON. Turn them off in Settings before launch.</div> : null}
          {tab === 'overview' && <OverviewTab ov={ov} go={go} />}
          {tab === 'applications' && <Applications onChange={loadOv} />}
          {tab === 'reviews' && <Reviews onChange={loadOv} />}
          {tab === 'tickets' && <Tickets onChange={loadOv} />}
          {tab === 'revenue' && <Revenue />}
          {tab === 'strikes' && <Strikes />}
          {tab === 'fees' && <Fees />}
          {tab === 'access' && <AccessLog />}
          {tab === 'bookings' && <Bookings key={preset} preset={preset} />}
          {tab === 'users' && <Users key={preset} preset={preset} />}
          {tab === 'team' && me && <Team me={me} />}
          {tab === 'settings' && <Settings onChange={loadOv} />}
          {tab === 'profile' && me && <Profile me={me} onSaved={loadMe} />}
        </div>
      </main>
    </div>
  );
}

function Profile({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [first, setFirst] = useState(me.first_name);
  const [last, setLast] = useState(me.last_name);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [busy, setBusy] = useState('');
  const saveInfo = async () => {
    setMsg(''); setErr('');
    if (!first.trim() || !last.trim()) return setErr('Enter your first and last name.');
    const digits = phone.replace(/\D/g, '').replace(/^63/, '').replace(/^0/, '');
    if (digits && !/^9\d{9}$/.test(digits)) return setErr('Enter a valid PH mobile number, like 917 123 4567.');
    setBusy('info');
    const { error } = await supabase.from('profiles').update({ first_name: first.trim(), last_name: last.trim(), phone: digits || null }).eq('id', me.id);
    setBusy('');
    if (error) return setErr(error.message.includes('duplicate') ? 'That mobile number is already used by another account.' : error.message);
    setMsg('Saved.'); onSaved();
  };
  // shrink to a 512px square JPEG before upload, so photos stay small and fast
  const uploadPhoto = async (file: File) => {
    setMsg(''); setErr('');
    if (file.size > 15 * 1024 * 1024) return setErr('That photo is too big. Use one under 15 MB.');
    setBusy('photo');
    try {
      const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Can’t read that image.')); i.src = URL.createObjectURL(file); });
      const side = Math.min(img.width, img.height); const c = document.createElement('canvas'); c.width = c.height = 512;
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 512, 512);
      const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.86));
      const path = `${me.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('admin-avatars').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      await rpc('admin_set_my_photo', { p_path: path });
      if (me.photo) await supabase.storage.from('admin-avatars').remove([me.photo]);
      setMsg('Photo updated.'); onSaved();
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const removePhoto = async () => {
    if (!confirm('Remove your profile photo?')) return;
    setBusy('photo');
    try { await rpc('admin_set_my_photo', { p_path: null }); if (me.photo) await supabase.storage.from('admin-avatars').remove([me.photo]); onSaved(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const savePw = async () => {
    setPwMsg(''); setPwErr('');
    if (pw.length < 10) return setPwErr('Use at least 10 characters.');
    if (pw !== pw2) return setPwErr('The two passwords don’t match.');
    setBusy('pw');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy('');
    if (error) return setPwErr(error.message);
    setPw(''); setPw2(''); setPwMsg('Password changed. Use the new one next time you sign in.');
  };
  return (
    <>
      <p className="sub">Your admin account. Your name shows on reviews you approve or reject.</p>
      <div className="cols">
        <section className="card form">
          <div className="row" style={{ gap: 14, marginBottom: 6 }}>
            <div className="avatar-edit">
              <Avatar path={me.photo} text={initials({ ...me, first_name: first, last_name: last })} size="xl" />
              {busy === 'photo' && <span className="avatar-busy">…</span>}
              <label className="avatar-cam" data-tip={me.photo ? 'Change photo' : 'Add photo'} aria-label={me.photo ? 'Change photo' : 'Add photo'}>
                <Icon name="camera" size={16} />
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy === 'photo'} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPhoto(f); }} />
              </label>
              {me.photo && (
                <button className="avatar-del" data-tip="Remove photo" aria-label="Remove photo" disabled={busy === 'photo'} onClick={removePhoto}><Icon name="trash" size={14} /></button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2>{`${first} ${last}`.trim() || 'Your name'}</h2>
              <span className="tag" style={{ alignSelf: 'flex-start' }}>{me.role.toUpperCase()}</span>
            </div>
          </div>
          <label>First name<input className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
          <label>Last name<input className="input" value={last} onChange={(e) => setLast(e.target.value)} /></label>
          <label><span>Mobile number <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></span>
            <div className="prefix"><span>+63</span><input className="input" inputMode="tel" placeholder="917 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </label>
          <label>Email<input className="input" value={me.email} disabled /></label>
          {err && <div className="err">{err}</div>}
          {msg && <div className="okmsg">{msg}</div>}
          <div><button className="btn primary" disabled={busy === 'info'} onClick={saveInfo}>{busy === 'info' ? 'Saving…' : 'Save changes'}</button></div>
        </section>
        <section className="card form">
          <h2>Change password</h2>
          <p className="muted" style={{ margin: 0 }}>At least 10 characters. Don’t reuse a password from another site.</p>
          <label>New password
            <div className="pw">
              <input className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <button type="button" className="eye" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </label>
          <label>Type it again
            <input className="input" type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && savePw()} />
          </label>
          {pwErr && <div className="err">{pwErr}</div>}
          {pwMsg && <div className="okmsg">{pwMsg}</div>}
          <div><button className="btn primary" disabled={busy === 'pw' || !pw} onClick={savePw}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button></div>
        </section>
      </div>
    </>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'forgot'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const go = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        onDone();
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?setpw=1` });
        if (error) throw error;
        setMsg('If this email has an admin login, we sent a link to set a new password. Check your inbox and spam folder.');
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="card">
        <div className="row"><BrandLogo height={30} dark /><span className="badge">ADMIN</span></div>
        <h2>{mode === 'in' ? 'Sign in' : 'Reset your password'}</h2>
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
          onKeyDown={(e) => mode === 'forgot' && e.key === 'Enter' && go()} />
        {mode === 'in' && (
          <div className="pw">
            <input className="input" type={showPw ? 'text' : 'password'} placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && go()} />
            <button type="button" className="eye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {msg && <div className="note">{msg}</div>}
        <button className="btn primary" disabled={busy || !email || (mode === 'in' && !pw)} onClick={go}>
          {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Send reset link'}
        </button>
        <button className="btn" onClick={() => { setMode(mode === 'in' ? 'forgot' : 'in'); setErr(''); setMsg(''); }}>
          {mode === 'in' ? 'Forgot password?' : 'Back to sign in'}
        </button>
        <p className="muted">Admin logins are by invite only. A superadmin adds you under Admins and you get an email to set your password.</p>
      </div>
    </div>
  );
}

function SetPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr('');
    if (pw.length < 10) return setErr('Use at least 10 characters.');
    if (pw !== pw2) return setErr('The two passwords don’t match.');
    setBusy(true);
    try { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) throw error; onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="card">
        <div className="row"><BrandLogo height={30} dark /><span className="badge">ADMIN</span></div>
        <h2>Set your password</h2>
        <p className="muted">For <b>{email}</b>. Use at least 10 characters. Only you will know it.</p>
        <div className="pw">
          <input className="input" type={show ? 'text' : 'password'} placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <input className="input" type={show ? 'text' : 'password'} placeholder="Type it again" value={pw2} onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password" onKeyDown={(e) => e.key === 'Enter' && save()} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy || !pw || !pw2} onClick={save}>{busy ? 'Saving…' : 'Save password and continue'}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function OverviewTab({ ov, go }: { ov: Overview | null; go: (t: Tab, f?: string) => void }) {
  if (!ov) return <p className="muted">Loading…</p>;
  const s = (k: string, label: string, alert: boolean, tab: Tab, f = '') => (
    <button className={'card stat click' + (alert && Number(ov[k]) > 0 ? ' alert' : '')} onClick={() => go(tab, f)}>
      <div className="v">{String(ov[k] ?? 0)}</div><div className="k">{label} <span className="go">→</span></div>
    </button>
  );
  return (
    <>
      <p className="sub">What needs attention today. Click a box to open the list.</p>
      <h2 style={{ marginBottom: 10 }}>To do</h2>
      <div className="grid" style={{ marginBottom: 24 }}>
        {s('sos_open', 'Open SOS alerts', true, 'tickets')}
        {s('applications', 'Tasker applications to review', true, 'applications')}
        {s('qr_pending', 'Payment QRs to review', true, 'reviews')}
        {s('skills_pending', 'Skills to review', true, 'reviews')}
        {s('tickets_open', 'Open reports', true, 'tickets')}
      </div>
      <h2 style={{ marginBottom: 10 }}>Activity</h2>
      <div className="grid">
        {s('users', 'Users (not demo)', false, 'users', 'all')}
        {s('taskers', 'Active taskers', false, 'users', 'taskers')}
        {s('online', 'Taskers online now', false, 'users', 'online')}
        {s('bookings_today', 'Bookings today', false, 'bookings', 'today')}
        {s('active_bookings', 'Bookings in progress', false, 'bookings', 'active')}
        {s('completed_total', 'Completed bookings', false, 'bookings', 'completed')}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
function useSigned(bucket: string, path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (!path) return; supabase.storage.from(bucket).createSignedUrl(path, 600).then(({ data }) => setUrl(data?.signedUrl ?? null)); }, [bucket, path]);
  return url;
}
function Avatar({ path, text, size }: { path?: string | null; text: string; size?: 'sm' | 'lg' | 'xl' }) {
  const url = useSigned('admin-avatars', path ?? null);
  const cls = 'avatar' + (size ? ' ' + size : '');
  return path && url ? <img className={cls + ' photo'} src={url} alt="" /> : <span className={cls}>{text}</span>;
}
function Photo({ bucket, path, label, onZoom }: { bucket: string; path?: string | null; label: string; onZoom: (u: string) => void }) {
  const url = useSigned(bucket, path);
  return <figure><img src={url ?? ''} alt={label} onClick={() => url && onZoom(url)} /><figcaption>{label}</figcaption></figure>;
}
function Zoom({ url, onClose }: { url: string | null; onClose: () => void }) {
  return url ? <div className="zoom" onClick={onClose}><img src={url} alt="" /></div> : null;
}

function Applications({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<'todo' | 'all'>('todo');
  const [zoom, setZoom] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const load = async () => {
    let q = supabase.from('tasker_verifications')
      .select('id,user_id,status,flags,id1_type,id2_type,id1_image_path,id2_image_path,selfie_path,submitted_at,reviewed_at,review_note,profile:profiles!tasker_verifications_user_id_fkey(first_name,last_name,email,phone,is_demo)')
      .order('submitted_at', { ascending: false }).limit(100);
    if (filter === 'todo') q = q.in('status', ['submitted', 'flagged']);
    const { data } = await q; setRows(data ?? []);
  };
  useEffect(() => { load(); }, [filter]);
  const show = async (id: string) => { await rpc('admin_log_kyc_view', { p_verification: id }); setShown({ ...shown, [id]: true }); };
  const review = async (id: string, ok: boolean) => {
    const note = ok ? null : prompt('Reason for rejecting (the tasker will see this):');
    if (!ok && !note) return;
    try { await rpc('admin_review_verification', { p_id: id, p_approve: ok, p_note: note }); await load(); onChange(); } catch (e: any) { alert(e.message); }
  };
  return (
    <>
      
      <p className="sub">Compare both IDs and the selfie with the name on the account. Every time you open the photos it’s logged.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={'btn' + (filter === 'todo' ? ' primary' : '')} onClick={() => setFilter('todo')}>To review</button>
        <button className={'btn' + (filter === 'all' ? ' primary' : '')} onClick={() => setFilter('all')}>All</button>
      </div>
      {rows === null && <p className="muted">Loading…</p>}
      {rows?.length === 0 && <div className="card">Nothing to review. 🎉</div>}
      <div className="list">
        {rows?.map((v) => (
          <div className="card" key={v.id}>
            <div className="row between">
              <div>
                <h2>{v.profile?.first_name} {v.profile?.last_name} {v.profile?.is_demo && <span className="tag warn">DEMO</span>}</h2>
                <div className="muted">{v.profile?.email} · +63 {v.profile?.phone} · submitted {when(v.submitted_at)}</div>
              </div>
              <span className={'tag ' + (v.status === 'approved' ? 'ok' : v.status === 'rejected' ? 'err' : 'warn')}>{v.status.toUpperCase()}</span>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="tag">{v.id1_type}</span><span className="tag">{v.id2_type}</span>
              {(v.flags ?? []).map((f: string) => <span key={f} className="tag warn">{f.replace(/_/g, ' ')}</span>)}
            </div>
            {shown[v.id] ? (
              <div className="photos">
                <Photo bucket="kyc" path={v.id1_image_path} label={`ID 1 · ${v.id1_type}`} onZoom={setZoom} />
                <Photo bucket="kyc" path={v.id2_image_path} label={`ID 2 · ${v.id2_type}`} onZoom={setZoom} />
                <Photo bucket="kyc" path={v.selfie_path} label="Face-check selfie" onZoom={setZoom} />
              </div>
            ) : <button className="btn" style={{ margin: '10px 0' }} onClick={() => show(v.id)}>Show ID photos (logged)</button>}
            {v.review_note && <p className="muted">Note: {v.review_note}</p>}
            {(v.status === 'submitted' || v.status === 'flagged') && (
              <div className="row">
                <button className="btn green" onClick={() => review(v.id, true)}>Approve · adds 1,000 coins</button>
                <button className="btn danger" onClick={() => review(v.id, false)}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Zoom url={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

function Reviews({ onChange }: { onChange: () => void }) {
  const [qrs, setQrs] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from('tasker_profiles').select('user_id,qr_wallet_type,qr_account_name,payment_qr_path,profile:profiles!tasker_profiles_user_id_fkey(first_name,last_name)').eq('qr_status', 'pending'),
      supabase.from('tasker_skills').select('id,custom_name,base_fee,created_at,skill:skills!tasker_skills_skill_id_fkey(name,needs_license),profile:profiles!tasker_skills_tasker_id_fkey(first_name,last_name)').eq('status', 'pending_review'),
    ]);
    setQrs(a.data ?? []); setSkills(b.data ?? []);
  };
  useEffect(() => { load(); }, []);
  const doQr = async (id: string, ok: boolean) => { try { await rpc('admin_review_qr', { p_tasker: id, p_approve: ok }); load(); onChange(); } catch (e: any) { alert(e.message); } };
  const doSkill = async (id: string, ok: boolean) => { try { await rpc('admin_review_skill', { p_id: id, p_approve: ok }); load(); onChange(); } catch (e: any) { alert(e.message); } };
  return (
    <>
      
      <p className="sub">QRs land here when the account name doesn’t match the tasker’s ID. Skills land here when they need a license or were typed in by the tasker.</p>
      <h2 style={{ margin: '8px 0 10px' }}>Payment QRs ({qrs.length})</h2>
      <div className="list">
        {qrs.length === 0 && <div className="card muted">No QRs to review.</div>}
        {qrs.map((q) => (
          <div className="card" key={q.user_id}>
            <div className="row between">
              <div><h2>{q.profile?.first_name} {q.profile?.last_name}</h2>
                <div className="muted">{(q.qr_wallet_type ?? '').toUpperCase()} · name on QR: <b>{q.qr_account_name}</b></div></div>
              <div className="row">
                <button className="btn green" onClick={() => doQr(q.user_id, true)}>Approve</button>
                <button className="btn danger" onClick={() => doQr(q.user_id, false)}>Reject</button>
              </div>
            </div>
            <div className="photos"><Photo bucket="tasker-media" path={q.payment_qr_path} label="Payment QR" onZoom={setZoom} /></div>
          </div>
        ))}
      </div>
      <h2 style={{ margin: '24px 0 10px' }}>Skills ({skills.length})</h2>
      <div className="list">
        {skills.length === 0 && <div className="card muted">No skills to review.</div>}
        {skills.map((k) => (
          <div className="card row between" key={k.id}>
            <div>
              <h2>{k.custom_name ?? k.skill?.name} {k.skill?.needs_license && <span className="tag warn">NEEDS LICENSE</span>} {k.custom_name && <span className="tag">TYPED BY TASKER</span>}</h2>
              <div className="muted">{k.profile?.first_name} {k.profile?.last_name} · starts at {peso(k.base_fee)} · {when(k.created_at)}</div>
            </div>
            <div className="row">
              <button className="btn green" onClick={() => doSkill(k.id, true)}>Approve</button>
              <button className="btn danger" onClick={() => doSkill(k.id, false)}>Reject</button>
            </div>
          </div>
        ))}
      </div>
      <Zoom url={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

function Tickets({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const load = async () => {
    let q = supabase.from('tickets')
      .select('id,ticket_no,kind,priority,status,reasons,body,location,created_at,photo_path,reporter:profiles!tickets_reporter_id_fkey(first_name,last_name,email),reported:profiles!tickets_reported_id_fkey(first_name,last_name,email),booking:bookings!tickets_booking_id_fkey(code,status)')
      .order('priority', { ascending: true }).order('created_at', { ascending: false }).limit(100);
    if (filter === 'open') q = q.in('status', ['open', 'in_review']);
    const { data } = await q; setRows(data ?? []);
  };
  useEffect(() => { load(); }, [filter]);
  const set = async (id: string, s: string) => { try { await rpc('admin_set_ticket', { p_id: id, p_status: s }); load(); onChange(); } catch (e: any) { alert(e.message); } };
  return (
    <>
      
      <p className="sub">SOS and safety reports first. Resolving a ticket notifies the person who sent it.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={'btn' + (filter === 'open' ? ' primary' : '')} onClick={() => setFilter('open')}>Open</button>
        <button className={'btn' + (filter === 'all' ? ' primary' : '')} onClick={() => setFilter('all')}>All</button>
      </div>
      {rows === null && <p className="muted">Loading…</p>}
      {rows?.length === 0 && <div className="card">No open reports.</div>}
      <div className="list">
        {rows?.map((t) => (
          <div className="card" key={t.id} style={t.kind === 'sos' && t.status !== 'resolved' && t.status !== 'closed' ? { borderColor: '#F3B8B2', background: '#FFF6F5' } : undefined}>
            <div className="row between">
              <div className="row">
                <h2>{t.ticket_no}</h2>
                <span className={'tag ' + (t.kind === 'sos' || t.priority === 'high' ? 'err' : '')}>{t.kind.replace(/_/g, ' ').toUpperCase()}</span>
                <span className={'tag ' + (t.status === 'resolved' || t.status === 'closed' ? 'ok' : 'warn')}>{t.status.toUpperCase()}</span>
              </div>
              <span className="muted">{when(t.created_at)}</span>
            </div>
            <p style={{ margin: '8px 0', fontSize: 14 }}>
              <b>From:</b> {t.reporter?.first_name} {t.reporter?.last_name} ({t.reporter?.email})
              {t.reported && <> · <b>About:</b> {t.reported.first_name} {t.reported.last_name} ({t.reported.email})</>}
              {t.booking && <> · <b>Booking:</b> {t.booking.code} ({t.booking.status.replace(/_/g, ' ')})</>}
            </p>
            {(t.reasons ?? []).length > 0 && <div className="row">{t.reasons.map((r: string) => <span key={r} className="tag">{r}</span>)}</div>}
            {t.body && <p style={{ fontSize: 14, color: 'var(--body)' }}>{t.body}</p>}
            {t.location?.lat && <p className="muted">Location: <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${t.location.lat},${t.location.lng}`}>{Number(t.location.lat).toFixed(5)}, {Number(t.location.lng).toFixed(5)}</a> at {when(t.location.at)}</p>}
            {t.status !== 'resolved' && t.status !== 'closed' && (
              <div className="row">
                {t.status === 'open' && <button className="btn" onClick={() => set(t.id, 'in_review')}>Mark in review</button>}
                <button className="btn green" onClick={() => set(t.id, 'resolved')}>Resolve</button>
                <button className="btn" onClick={() => set(t.id, 'closed')}>Close</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

const BK_FILTERS: [string, string][] = [['all', 'All'], ['today', 'Today'], ['active', 'In progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
const FINAL = '(completed,cancelled,declined_by_tasker)';
function Bookings({ preset }: { preset?: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState(preset || 'all');
  const load = async () => {
    let s = supabase.from('bookings')
      .select('id,code,status,created_at,when_type,starting_total,initial_offer,final_price,fee_coins,cancel_reason,client:profiles!bookings_client_id_fkey(first_name,last_name,is_demo),tasker:profiles!bookings_tasker_id_fkey(first_name,last_name,is_demo)')
      .order('created_at', { ascending: false }).limit(200);
    if (q.trim()) s = s.ilike('code', `%${q.trim()}%`);
    if (f === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); s = s.gte('created_at', d.toISOString()); }
    if (f === 'active') s = s.not('status', 'in', FINAL);
    if (f === 'completed') s = s.eq('status', 'completed');
    if (f === 'cancelled') s = s.in('status', ['cancelled', 'declined_by_tasker']);
    const { data } = await s; setRows(data ?? []);
  };
  useEffect(() => { load(); }, [f]);
  return (
    <>
      <p className="sub">Latest 200. Search by booking code.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        {BK_FILTERS.map(([k, l]) => <button key={k} className={'btn' + (f === k ? ' primary' : '')} onClick={() => setF(k)}>{l}</button>)}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" placeholder="BK-…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn" onClick={load}>Search</button>
      </div>
      {rows === null ? <p className="muted">Loading…</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Code</th><th>Status</th><th>Client</th><th>Tasker</th><th>Price</th><th>Coins</th><th>Created</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><b>{b.code}</b></td>
                <td>{b.status.replace(/_/g, ' ')}{b.cancel_reason ? <div className="muted">{b.cancel_reason.replace(/_/g, ' ')}</div> : null}</td>
                <td>{b.client?.first_name} {b.client?.last_name} {b.client?.is_demo && <span className="tag warn">DEMO</span>}</td>
                <td>{b.tasker?.first_name} {b.tasker?.last_name} {b.tasker?.is_demo && <span className="tag warn">DEMO</span>}</td>
                <td>{peso(b.final_price ?? b.initial_offer ?? b.starting_total)}</td>
                <td>{b.fee_coins ?? '—'}</td>
                <td>{when(b.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}

const US_FILTERS: [string, string][] = [['all', 'All'], ['clients', 'Clients'], ['taskers', 'Active taskers'], ['online', 'Online now'], ['admins', 'Admins']];
function UserProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const [u, setU] = useState<any>(null);
  const [err, setErr] = useState('');
  const [ids, setIds] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => { rpc('admin_user_profile', { p_user: id }).then(setU).catch((e) => setErr(e.message)); }, [id]);
  const t = u?.tasker;
  const photo = useSigned('tasker-media', t?.photo_path);
  const showIds = async () => { await rpc('admin_log_kyc_view', { p_verification: t.verification.id }); setIds(true); };
  const stat = (k: string, v: any) => <div className="card stat"><div className="v">{v ?? '—'}</div><div className="k">{k}</div></div>;
  const ini = u ? ((u.first_name?.[0] ?? '') + (u.last_name?.[0] ?? '')).toUpperCase() : '';
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}><h2>Profile</h2><button className="btn" onClick={onClose}>Close</button></div>
        {err && <div className="err">{err}</div>}
        {!u && !err && <p className="muted">Loading…</p>}
        {u && (<>
          <div className="row" style={{ gap: 14, alignItems: 'center', marginBottom: 14 }}>
            {photo ? <img src={photo} alt="" onClick={() => setZoom(photo)} style={{ width: 84, height: 84, borderRadius: 20, objectFit: 'cover', cursor: 'zoom-in' }} />
              : <span className="avatar" style={{ width: 84, height: 84, fontSize: 28, borderRadius: 20 }}>{ini}</span>}
            <div>
              <h2 style={{ fontSize: 22 }}>{u.first_name} {u.last_name}{t?.nickname ? <span className="muted" style={{ fontWeight: 600 }}> · “{t.nickname}”</span> : null}</h2>
              {t?.title && <div>{t.title}{t.years ? ` · ${t.years} yrs` : ''}</div>}
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <span className="tag">{u.is_tasker ? 'TASKER' : 'CLIENT'}</span>
                <span className={'tag ' + (u.status === 'active' ? 'ok' : 'err')}>{String(u.status).toUpperCase()}</span>
                {u.plan === 'plus' && <span className="tag ok">PLUS</span>}
                {t?.top && <span className="tag ok">★ TOP TASKER</span>}
                {u.is_admin && <span className="tag">ADMIN</span>}
                {u.is_demo && <span className="tag warn">DEMO</span>}
                {u.suspended_until && <span className="tag err">SUSPENDED UNTIL {when(u.suspended_until)}</span>}
                {t?.paused && !u.suspended_until && <span className="tag err">PAUSED</span>}
              </div>
            </div>
          </div>
          {!t && <p className="muted" style={{ marginBottom: 12 }}>Clients don’t upload a photo or ID in the app, so there’s no face to show. Their name, contact and history are below.</p>}

          <h3>Contact</h3>
          <div className="card" style={{ marginBottom: 14 }}>
            <div>{u.email}</div>
            <div>{u.phone ? `+63 ${u.phone}` : <span className="muted">no mobile</span>}</div>
            <div className="muted">Emergency contact: {u.emergency_name ? `${u.emergency_name} · ${u.emergency_phone ?? ''}` : 'none'}</div>
            <div className="muted">Areas: {u.areas.length ? u.areas.join(' · ') : '—'}</div>
            <div className="muted">Joined {when(u.created_at)}{u.closed_at ? ` · closed ${when(u.closed_at)} (${u.close_reason ?? ''})` : ''}</div>
          </div>

          <h3>As a client</h3>
          <div className="stats" style={{ marginBottom: 14 }}>
            {stat('Bookings', u.as_client.total)}{stat('Completed', u.as_client.completed)}{stat('Cancelled by them', u.as_client.cancelled)}
            {stat('Rating from taskers', u.as_client.rating ? `★ ${u.as_client.rating} (${u.as_client.rating_count})` : '—')}
          </div>

          {t && (<>
            <h3>As a tasker</h3>
            <div className="stats" style={{ marginBottom: 10 }}>
              {stat('Rating', t.rating ? `★ ${t.rating} (${t.rating_count})` : '—')}{stat('Jobs done', t.jobs_done)}
              {stat('Cancelled by them', t.as_tasker.cancelled)}{stat('Strikes (90 days)', t.strikes_90d)}{stat('Coins', Number(t.coins).toLocaleString())}
              {stat('Status', t.online ? 'Online' : 'Offline')}
            </div>
            {t.bio && <p style={{ marginBottom: 10 }}>{t.bio}</p>}
            <div className="muted" style={{ marginBottom: 10 }}>Works around {t.area ?? '—'} · up to {t.radius_km ?? '—'} km</div>
            <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {t.skills.map((k: any, i: number) => <span key={i} className={'tag' + (k.status === 'active' ? ' ok' : ' warn')}>{k.name} · ₱{Number(k.price).toLocaleString()}{k.status !== 'active' ? ` · ${k.status.replace(/_/g, ' ')}` : ''}</span>)}
            </div>
            <h3>Payment QR</h3>
            <div className="card" style={{ marginBottom: 14 }}>
              <div>{t.qr_wallet ?? '—'} · account name: <b>{t.qr_name ?? '—'}</b> · <span className="tag">{String(t.qr_status).toUpperCase()}</span></div>
              {t.qr_path && <div className="photos"><Photo bucket="tasker-media" path={t.qr_path} label="Payment QR" onZoom={setZoom} /></div>}
            </div>
            {t.portfolio.length > 0 && (<>
              <h3>Portfolio</h3>
              <div className="photos" style={{ marginBottom: 14 }}>{t.portfolio.map((pth: string) => <Photo key={pth} bucket="tasker-media" path={pth} label="" onZoom={setZoom} />)}</div>
            </>)}
            <h3>ID verification</h3>
            <div className="card" style={{ marginBottom: 14 }}>
              {!t.verification ? <span className="muted">No ID submitted.</span> : (<>
                <div className="row" style={{ gap: 6 }}>
                  <span className={'tag ' + (t.verification.status === 'approved' ? 'ok' : t.verification.status === 'rejected' ? 'err' : 'warn')}>{String(t.verification.status).toUpperCase()}</span>
                  <span className="tag">{t.verification.id1_type}</span><span className="tag">{t.verification.id2_type}</span>
                </div>
                {ids ? (
                  <div className="photos">
                    <Photo bucket="kyc" path={t.verification.id1_path} label={`ID 1 · ${t.verification.id1_type}`} onZoom={setZoom} />
                    <Photo bucket="kyc" path={t.verification.id2_path} label={`ID 2 · ${t.verification.id2_type}`} onZoom={setZoom} />
                    <Photo bucket="kyc" path={t.verification.selfie_path} label="Face-check selfie" onZoom={setZoom} />
                  </div>
                ) : <button className="btn" style={{ marginTop: 8 }} onClick={showIds}>Show ID photos (logged)</button>}
              </>)}
            </div>
          </>)}

          <h3>Safety</h3>
          <div className="stats" style={{ marginBottom: 10 }}>
            {stat('Reports against', u.reports_count)}{stat('Blocked by', u.blocked_by)}{stat('Contact-number attempts (90 days)', u.contact_attempts_90d)}
          </div>
          {u.reports_against.length > 0 && (
            <div className="tablewrap" style={{ marginBottom: 14 }}><table>
              <thead><tr><th>Ticket</th><th>Kind</th><th>Reasons</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{u.reports_against.map((r: any) => <tr key={r.no}><td>{r.no}</td><td>{r.kind}</td><td>{(r.reasons ?? []).join(', ') || '—'}</td><td>{r.status}</td><td>{when(r.at)}</td></tr>)}</tbody>
            </table></div>
          )}

          {u.reviews.length > 0 && (<>
            <h3>Latest reviews</h3>
            <div className="list" style={{ marginBottom: 14 }}>
              {u.reviews.map((r: any, i: number) => <div key={i} className="card"><b>★ {r.rating}</b> <span className="muted">· from a {r.direction === 'client_to_tasker' ? 'client' : 'tasker'} · {when(r.at)}</span>{r.body && <div>{r.body}</div>}</div>)}
            </div>
          </>)}

          <h3>Latest bookings</h3>
          {u.bookings.length === 0 ? <p className="muted">No bookings yet.</p> : (
            <div className="tablewrap" style={{ marginBottom: 14 }}><table>
              <thead><tr><th>Code</th><th>As</th><th>With</th><th>Status</th><th>Amount</th><th>When</th></tr></thead>
              <tbody>{u.bookings.map((b: any) => <tr key={b.id}><td>{b.code}</td><td>{b.role}</td><td>{b.other ?? '—'}</td><td>{String(b.status).replace(/_/g, ' ')}</td><td>{b.amount != null ? peso(Number(b.amount)) : '—'}</td><td>{when(b.at)}</td></tr>)}</tbody>
            </table></div>
          )}

          <p className="muted" style={{ fontSize: 12 }}>Opening this profile is logged. Recently viewed by: {u.views.map((v: any) => `${v.by} (${when(v.at)})`).join(', ')}</p>
        </>)}
        <Zoom url={zoom} onClose={() => setZoom(null)} />
      </aside>
    </div>
  );
}

function CoinsModal({ u, onClose }: { u: any; onClose: () => void }) {
  const [bal, setBal] = useState<number | null>(null);
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [amt, setAmt] = useState('');
  const [why, setWhy] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newBal, setNewBal] = useState<number | null>(null);
  useEffect(() => { rpc<number>('admin_coin_balance', { p_tasker: u.id }).then(setBal).catch((e) => setErr(e.message)); }, [u.id]);
  const n = Math.floor(Number(amt.replace(/[^0-9]/g, '')) || 0);
  const delta = mode === 'add' ? n : -n;
  const after = (bal ?? 0) + delta;
  const name = `${u.first_name} ${u.last_name}`;
  const next = () => {
    setErr('');
    if (!n) return setErr('Enter how many coins.');
    if (n > 100000) return setErr('That’s a lot of coins. Enter 100,000 or less.');
    if (why.trim().length < 5) return setErr('Write a short reason. The tasker will see it.');
    if (after < 0) return setErr(`They only have ${(bal ?? 0).toLocaleString()} coins.`);
    setStep('confirm');
  };
  const save = async () => {
    setBusy(true); setErr('');
    try { setNewBal(await rpc<number>('admin_adjust_coins', { p_tasker: u.id, p_amount: delta, p_note: why.trim() })); setStep('done'); }
    catch (e: any) { setErr(e.message); setStep('form'); } finally { setBusy(false); }
  };
  return (
    <div className="modal-bg" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Coins · {name}</h2>
        <p className="muted">{u.email}</p>
        <div className="card" style={{ padding: 12 }}>Current balance: <b>{bal === null ? '…' : `${bal.toLocaleString()} coins`}</b></div>

        {step === 'form' && (<>
          <div className="row" style={{ gap: 8 }}>
            <button className={'btn' + (mode === 'add' ? ' primary' : '')} onClick={() => setMode('add')}>Add coins</button>
            <button className={'btn' + (mode === 'deduct' ? ' primary' : '')} onClick={() => setMode('deduct')}>Deduct coins</button>
          </div>
          <input className="input" inputMode="numeric" placeholder="How many coins, e.g. 300" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9]/g, ''))} />
          <input className="input" placeholder="Reason (the tasker will see this)" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} />
          {n > 0 && bal !== null && <p className="muted">New balance will be <b>{after.toLocaleString()} coins</b>.</p>}
          {err && <div className="err">{err}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={bal === null} onClick={next}>Review</button>
          </div>
        </>)}

        {step === 'confirm' && (<>
          <div className={'modal-icon ' + (mode === 'add' ? 'ok' : 'err')}>{mode === 'add' ? '+' : '−'}</div>
          <h2>{mode === 'add' ? `Add ${n.toLocaleString()} coins to ${name}?` : `Deduct ${n.toLocaleString()} coins from ${name}?`}</h2>
          <ul>
            <li>Balance goes from <b>{(bal ?? 0).toLocaleString()}</b> to <b>{after.toLocaleString()}</b> coins.</li>
            <li>Reason they’ll see: “{why.trim()}”</li>
            <li>It shows in their coin history as a TSKR adjustment, and they get a notification.</li>
          </ul>
          {err && <div className="err">{err}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" disabled={busy} onClick={() => setStep('form')}>Back</button>
            <button className={'btn ' + (mode === 'add' ? 'primary' : 'solid-danger')} disabled={busy} onClick={save}>
              {busy ? 'Please wait…' : mode === 'add' ? 'Yes, add coins' : 'Yes, deduct coins'}
            </button>
          </div>
        </>)}

        {step === 'done' && (<>
          <div className="modal-icon ok">✓</div>
          <h2>Done</h2>
          <p>New balance: <b>{(newBal ?? after).toLocaleString()} coins</b>.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={onClose}>Close</button></div>
        </>)}
      </div>
    </div>
  );
}

function Users({ preset }: { preset?: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [hideDemo, setHideDemo] = useState(true);
  const [f, setF] = useState(preset || 'all');
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => {
    const cols = 'id,first_name,last_name,email,phone,signup_role,is_tasker,tasker_status,status,plan,is_demo,created_at';
    let s = supabase.from('profiles').select(f === 'online' ? cols + ',tp:tasker_profiles!tasker_profiles_user_id_fkey!inner(is_online)' : cols)
      .order('created_at', { ascending: false }).limit(300);
    if (hideDemo) s = s.eq('is_demo', false);
    if (f === 'clients') s = s.eq('is_tasker', false);
    if (f === 'taskers') s = s.eq('is_tasker', true).eq('tasker_status', 'active');
    if (f === 'online') s = s.eq('tp.is_online', true);
    if (q.trim()) s = s.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`);
    const [{ data }, { data: adm }] = await Promise.all([s, supabase.from('admin_users').select('user_id,role')]);
    const roles = new Map((adm ?? []).map((a: any) => [a.user_id, a.role]));
    let list = (data ?? []).map((u: any) => ({ ...u, admin_role: roles.get(u.id) ?? null }));
    // admin logins are staff, not customers: keep them out of Clients, show them under Admins
    if (f === 'clients') list = list.filter((u: any) => !u.admin_role);
    if (f === 'admins') list = list.filter((u: any) => u.admin_role);
    setRows(list);
  };
  useEffect(() => { load(); }, [hideDemo, f]);
  const [coinU, setCoinU] = useState<any>(null);
  const coinsFor = (u: any) => setCoinU(u);
  const [ask, setAsk] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (u: any) => setAsk(u);
  const doToggle = async () => {
    const u = ask; if (!u) return;
    setBusy(true);
    try { await rpc('admin_set_account', { p_user: u.id, p_active: u.status !== 'active' }); setAsk(null); load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <p className="sub">Search by name, email or mobile number.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        {US_FILTERS.map(([k, l]) => <button key={k} className={'btn' + (f === k ? ' primary' : '')} onClick={() => setF(k)}>{l}</button>)}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn" onClick={load}>Search</button>
        <label className="muted"><input type="checkbox" checked={hideDemo} onChange={(e) => setHideDemo(e.target.checked)} /> Hide demo accounts</label>
      </div>
      {rows === null ? <p className="muted">Loading…</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Role</th><th>Plan</th><th>Status</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><button className="link" onClick={() => setOpen(u.id)}><b>{u.first_name} {u.last_name}</b></button> {u.is_demo && <span className="tag warn">DEMO</span>}</td>
                <td>{u.email}<div className="muted">{u.phone ? `+63 ${u.phone}` : 'no mobile'}</div></td>
                <td>{u.admin_role ? <span className="tag ok">{String(u.admin_role).toUpperCase()}</span> : u.signup_role}{u.is_tasker ? <div className="muted">tasker · {u.tasker_status}</div> : u.tasker_status !== 'none' ? <div className="muted">tasker {u.tasker_status}</div> : null}</td>
                <td>{u.plan}</td>
                <td><span className={'tag ' + (u.status === 'active' ? 'ok' : 'err')}>{u.status}</span></td>
                <td>{when(u.created_at)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="iconbtn" onClick={() => setOpen(u.id)} data-tip="Profile" aria-label={`Profile of ${u.first_name} ${u.last_name}`}><Icon name="profile" /></button>
                  {(u.is_tasker || u.tasker_status !== 'none')
                    ? <button className="iconbtn" onClick={() => coinsFor(u)} data-tip="Coins" aria-label={`Coins of ${u.first_name} ${u.last_name}`}><Icon name="coins" /></button>
                    : <span className="iconbtn-spacer" aria-hidden />}
                  {u.admin_role ? <span className="iconbtn-spacer" aria-hidden /> : u.status === 'active'
                    ? <button className="iconbtn danger" onClick={() => toggle(u)} data-tip="Suspend" aria-label={`Suspend ${u.first_name} ${u.last_name}`}><Icon name="ban" /></button>
                    : <button className="iconbtn ok" onClick={() => toggle(u)} data-tip="Restore" aria-label={`Restore ${u.first_name} ${u.last_name}`}><Icon name="restore" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {open && <UserProfile id={open} onClose={() => { setOpen(null); load(); }} />}
      {ask && (() => {
        const restoring = ask.status !== 'active';
        const name = `${ask.first_name} ${ask.last_name}`;
        return (
          <div className="modal-bg" onClick={() => !busy && setAsk(null)}>
            <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className={'modal-icon ' + (restoring ? 'ok' : 'err')}>{restoring ? '↺' : '!'}</div>
              <h2>{restoring ? `Restore ${name}?` : `Suspend ${name}?`}</h2>
              <p className="muted">{ask.email}{ask.is_tasker ? ' · tasker' : ' · client'}</p>
              {restoring ? (
                <ul>
                  <li>They can use TSKR again: book{ask.is_tasker ? ', go online and take jobs' : ' taskers'}.</li>
                  <li>Their bookings, coins and history are kept as they were.</li>
                </ul>
              ) : (
                <ul>
                  <li>They can’t book{ask.is_tasker ? ', go online or get new requests' : ' taskers'}.</li>
                  {ask.is_tasker && <li>They’re taken offline right away and hidden from clients.</li>}
                  <li>Nothing is deleted. You can restore them anytime from this list.</li>
                  <li>Check their open bookings first so no client or tasker is left waiting.</li>
                </ul>
              )}
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button className="btn" disabled={busy} onClick={() => setAsk(null)}>Cancel</button>
                <button className={'btn ' + (restoring ? 'primary' : 'solid-danger')} disabled={busy} onClick={doToggle}>
                  {busy ? 'Please wait…' : restoring ? 'Yes, restore' : 'Yes, suspend'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {coinU && <CoinsModal u={coinU} onClose={() => setCoinU(null)} />}
    </>
  );
}

const PERIODS: [string, string][] = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['30', 'Last 30 days'], ['all', 'All time']];
function periodRange(k: string): [Date, Date] {
  const now = new Date(); const end = new Date(now.getTime() + 60000);
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (k === 'today') return [d, end];
  if (k === 'week') { const w = new Date(d); w.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [w, end]; }
  if (k === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1), end];
  if (k === '30') return [new Date(now.getTime() - 30 * 864e5), end];
  return [new Date('2020-01-01'), end];
}
function Revenue() {
  const [period, setPeriod] = useState('month');
  const [demo, setDemo] = useState(true);
  const [r, setR] = useState<any>(null);
  const [pays, setPays] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const load = async () => {
    setErr('');
    const [from, to] = periodRange(period);
    try {
      setR(await rpc('admin_revenue', { p_from: from.toISOString(), p_to: to.toISOString(), p_include_demo: demo }));
      let q = supabase.from('payments').select('id,purpose,amount_php,coins,gateway,gateway_txn_id,method,status,paid_at,user:profiles!payments_user_id_fkey(first_name,last_name,email,is_demo)')
        .gte('paid_at', from.toISOString()).lt('paid_at', to.toISOString()).order('paid_at', { ascending: false }).limit(200);
      if (!demo) q = q.neq('gateway', 'demo');
      const { data } = await q; setPays((data ?? []).filter((x: any) => demo || !x.user?.is_demo));
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [period, demo]);
  const days: any[] = r?.by_day ?? [];
  const max = Math.max(1, ...days.map((d) => Number(d.coins) + Number(d.plus)));
  const used = r?.used ?? {};
  const usedTotal = ['booking_fee', 'delivery_fee', 'skill_charge', 'penalty'].reduce((a, k) => a + Number(used[k] ?? 0), 0);
  return (
    <>
      <p className="sub">Money paid to TSKR: coin packs (taskers) and TSKR Plus (clients). Payments for jobs and the ₱100 cancellation fee go straight to taskers, so they’re not counted here.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        {PERIODS.map(([k, l]) => <button key={k} className={'btn' + (period === k ? ' primary' : '')} onClick={() => setPeriod(k)}>{l}</button>)}
      </div>
      <label className="muted" style={{ display: 'block', marginBottom: 16 }}>
        <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Include test payments (demo mode and demo accounts)
      </label>
      {err && <div className="err">{err}</div>}
      {!r ? <p className="muted">Loading…</p> : (
        <>
          {demo && <div className="note" style={{ marginBottom: 16 }}>Showing test payments too. Nobody was actually charged for these. Untick the box to see real money only.</div>}
          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="card stat" style={{ borderLeftColor: 'var(--green)' }}><div className="v">{peso(r.total_php)}</div><div className="k">Total revenue</div></div>
            <div className="card stat"><div className="v">{peso(r.coins_php)}</div><div className="k">Coin sales · {r.coins_count} {r.coins_count === 1 ? 'pack' : 'packs'}</div></div>
            <div className="card stat"><div className="v">{peso(r.plus_php)}</div><div className="k">TSKR Plus · {r.plus_count} {r.plus_count === 1 ? 'payment' : 'payments'}</div></div>
            <div className="card stat"><div className="v">{r.plus_active}</div><div className="k">Active Plus subscribers now</div></div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="row between" style={{ marginBottom: 12 }}>
              <h2>Revenue per day</h2>
              <div className="row" style={{ gap: 14 }}><span className="legend"><i style={{ background: 'var(--teal)' }} />Coins</span><span className="legend"><i style={{ background: 'var(--green)' }} />Plus</span></div>
            </div>
            {days.length === 0 ? <p className="muted">No payments in this period.</p> : (
              <div className="bars">
                {days.map((d) => {
                  const c = Number(d.coins), p = Number(d.plus);
                  return (
                    <div key={d.day} className="barcol" title={`${d.day}: coins ${peso(c)}, Plus ${peso(p)}`}>
                      <div className="barval">{peso(c + p)}</div>
                      <div className="bar">
                        <div style={{ height: `${(p / max) * 100}%`, background: 'var(--green)' }} />
                        <div style={{ height: `${(c / max) * 100}%`, background: 'var(--teal)' }} />
                      </div>
                      <div className="barlbl">{new Date(d.day + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="cols" style={{ marginBottom: 20 }}>
            <div className="card">
              <h2 style={{ marginBottom: 10 }}>Coins used by taskers</h2>
              <p className="muted" style={{ marginTop: 0 }}>Coins already bought, now spent. 1 coin = ₱1.</p>
              {([['Booking fees', used.booking_fee], ['Delivery fees', used.delivery_fee], ['Extra skill charges', used.skill_charge], ['Strike penalties', used.penalty]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="row between kv"><span>{l}</span><b>{Number(v ?? 0).toLocaleString()}</b></div>
              ))}
              <div className="row between kv" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}><b>Total used</b><b>{usedTotal.toLocaleString()}</b></div>
            </div>
            <div className="card">
              <h2 style={{ marginBottom: 10 }}>Good to know</h2>
              <div className="row between kv"><span>Free bookings given (weekly reward)</span><b>{r.free_bookings}</b></div>
              <div className="row between kv"><span>Free coins given (sign-up bonus, adjustments)</span><b>{Number(r.free_coins_given).toLocaleString()}</b></div>
              <div className="row between kv"><span>Unused coins taskers hold now</span><b>{Number(r.coins_outstanding).toLocaleString()}</b></div>
              <div className="row between kv"><span>Refunds</span><b>{peso(r.refunds_php)}</b></div>
              <p className="muted" style={{ marginBottom: 0 }}>Unused coins are already paid for but not yet spent. Ask your accountant how to record them.</p>
            </div>
          </div>

          <h2 style={{ marginBottom: 10 }}>Payments ({pays.length})</h2>
          {pays.length === 0 ? <div className="card muted">No payments in this period.</div> : (
            <div className="tablewrap"><table>
              <thead><tr><th>When</th><th>Who</th><th>For</th><th>Amount</th><th>Method</th><th>Status</th><th>Transaction</th></tr></thead>
              <tbody>
                {pays.map((x) => (
                  <tr key={x.id}>
                    <td>{when(x.paid_at)}</td>
                    <td>{x.user?.first_name} {x.user?.last_name}<div className="muted">{x.user?.email}</div></td>
                    <td>{x.purpose === 'coins' ? `${Number(x.coins).toLocaleString()} coins` : 'TSKR Plus · 30 days'}</td>
                    <td><b>{peso(x.amount_php)}</b></td>
                    <td>{x.method}</td>
                    <td><span className={'tag ' + (x.status === 'paid' ? 'ok' : 'warn')}>{x.status.toUpperCase()}</span></td>
                    <td>{x.gateway === 'demo' ? <span className="tag warn">TEST</span> : x.gateway}<div className="muted">{x.gateway_txn_id}</div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </>
      )}
    </>
  );
}

function Strikes() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [pauses, setPauses] = useState<any[]>([]);
  const [susp, setSusp] = useState<any[]>([]);
  const [warns, setWarns] = useState<any[]>([]);
  const load = async () => {
    const [c, d] = await Promise.all([
      supabase.from('profiles').select('id,first_name,last_name,email,suspended_until').gt('suspended_until', new Date().toISOString()).order('suspended_until'),
      supabase.from('contact_attempts').select('id,created_at,user:profiles!contact_attempts_user_id_fkey(id,first_name,last_name,email,is_tasker,is_demo),booking:bookings!contact_attempts_booking_id_fkey(code)')
        .gt('created_at', new Date(Date.now() - 90 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(200),
    ]);
    setSusp(c.data ?? []); setWarns(d.data ?? []);
    const [a, b] = await Promise.all([
      supabase.from('strikes').select('id,reason,weight,created_at,tasker:profiles!strikes_tasker_id_fkey(first_name,last_name,email,is_demo),booking:bookings!strikes_booking_id_fkey(code)')
        .gt('created_at', new Date(Date.now() - 90 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(200),
      supabase.from('tasker_pauses').select('id,reason,starts_at,ends_at,tasker:profiles!tasker_pauses_tasker_id_fkey(first_name,last_name,email)')
        .gt('ends_at', new Date().toISOString()).order('ends_at'),
    ]);
    setRows(a.data ?? []); setPauses(b.data ?? []);
  };
  useEffect(() => { load(); }, []);
  const remove = async (s: any) => {
    const note = prompt(`Remove this strike from ${s.tasker?.first_name} ${s.tasker?.last_name}?\nThe coin penalty is refunded. Reason (the tasker will see this):`);
    if (note === null) return;
    try { await rpc('admin_remove_strike', { p_id: s.id, p_refund: true, p_note: note || null }); load(); } catch (e: any) { alert(e.message); }
  };
  const endPause = async (p: any) => {
    if (!confirm(`End the pause for ${p.tasker?.first_name} ${p.tasker?.last_name} now?`)) return;
    try { await rpc('admin_end_pause', { p_id: p.id }); load(); } catch (e: any) { alert(e.message); }
  };
  const lift = async (u: any) => {
    const clear = confirm(`Lift the contact-number suspension for ${u.first_name} ${u.last_name}?\n\nOK = lift it and clear their warning (use this if it was a mistake).\nCancel = don't change anything.`);
    if (!clear) return;
    try { await rpc('admin_lift_suspension', { p_user: u.id, p_clear_warnings: true }); load(); } catch (e: any) { alert(e.message); }
  };
  return (
    <>
      <p className="sub">Strikes from the last 90 days. 1st strike: 100 coins, 2nd: 200 coins, 3rd in 30 days: 7-day pause. A no-show counts as 2. Remove a strike if it was given by mistake.</p>
      <h2 style={{ marginBottom: 10 }}>Paused taskers ({pauses.length})</h2>
      <div className="list" style={{ marginBottom: 24 }}>
        {pauses.length === 0 && <div className="card muted">Nobody is paused.</div>}
        {pauses.map((p) => (
          <div key={p.id} className="card row between">
            <div><h2>{p.tasker?.first_name} {p.tasker?.last_name}</h2><div className="muted">{p.tasker?.email} · {p.reason.replace(/_/g, ' ')} · until {when(p.ends_at)}</div></div>
            <button className="btn" onClick={() => endPause(p)}>End pause now</button>
          </div>
        ))}
      </div>
      <h2 style={{ marginBottom: 10 }}>Suspended clients ({susp.length})</h2>
      <div className="list" style={{ marginBottom: 24 }}>
        {susp.length === 0 && <div className="card muted">No suspended clients.</div>}
        {susp.map((u) => (
          <div key={u.id} className="card row between">
            <div><h2>{u.first_name} {u.last_name}</h2><div className="muted">{u.email} · shared a contact number after a warning · until {when(u.suspended_until)}</div></div>
            <button className="btn" onClick={() => lift(u)}>Lift suspension</button>
          </div>
        ))}
      </div>
      <h2 style={{ marginBottom: 10 }}>Contact number attempts in chat ({warns.length})</h2>
      <p className="sub">Messages with a phone number or another app are never sent or stored. 1st attempt: warning. 2nd within 90 days: 1-week suspension. Taskers suspended this way also show under Paused taskers (reason: contact sharing).</p>
      <div className="tablewrap" style={{ marginBottom: 24 }}><table>
        <thead><tr><th>User</th><th>Role</th><th>Booking</th><th>When</th><th></th></tr></thead>
        <tbody>
          {warns.length === 0 && <tr><td colSpan={5} className="muted">No attempts in the last 90 days.</td></tr>}
          {warns.map((w) => (
            <tr key={w.id}>
              <td><b>{w.user?.first_name} {w.user?.last_name}</b> {w.user?.is_demo && <span className="tag warn">DEMO</span>}<div className="muted">{w.user?.email}</div></td>
              <td>{w.user?.is_tasker ? 'Tasker' : 'Client'}</td><td>{w.booking?.code ?? '—'}</td><td>{when(w.created_at)}</td>
              <td><button className="btn" onClick={() => lift(w.user)}>Clear warning</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <h2 style={{ marginBottom: 10 }}>Strikes</h2>
      {rows === null ? <p className="muted">Loading…</p> : rows.length === 0 ? <div className="card muted">No strikes in the last 90 days.</div> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Tasker</th><th>Reason</th><th>Booking</th><th>When</th><th></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td><b>{s.tasker?.first_name} {s.tasker?.last_name}</b> {s.tasker?.is_demo && <span className="tag warn">DEMO</span>}<div className="muted">{s.tasker?.email}</div></td>
                <td>{s.reason}</td><td>{s.booking?.code ?? '—'}</td><td>{when(s.created_at)}</td>
                <td><button className="btn" onClick={() => remove(s)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}

function Fees() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const load = async () => {
    let q = supabase.from('cancellation_fees')
      .select('id,amount_php,status,reference_no,created_at,submitted_at,client:profiles!cancellation_fees_client_id_fkey(first_name,last_name,email),tasker:profiles!cancellation_fees_tasker_id_fkey(first_name,last_name,email),booking:bookings!cancellation_fees_booking_id_fkey(code)')
      .order('created_at', { ascending: false }).limit(200);
    if (filter === 'open') q = q.in('status', ['unpaid', 'submitted', 'not_received']);
    const { data } = await q; setRows(data ?? []);
  };
  useEffect(() => { load(); }, [filter]);
  const set = async (f: any, st: 'received' | 'settled') => {
    const msg = st === 'received' ? 'Mark as paid? Use this when the client shows proof of payment.' : 'Waive this fee? The client won’t have to pay and can book again.';
    if (!confirm(msg)) return;
    try { await rpc('admin_set_fee', { p_id: f.id, p_status: st }); load(); } catch (e: any) { alert(e.message); }
  };
  const label: Record<string, [string, string]> = {
    unpaid: ['UNPAID', 'warn'], submitted: ['REFERENCE SENT', 'warn'], not_received: ['DISPUTED', 'err'], received: ['PAID', 'ok'], settled: ['WAIVED', 'ok'],
  };
  return (
    <>
      <p className="sub">The ₱100 fee when a client cancels after the tasker is on the way. Clients can’t book again until it’s paid or waived. Disputed = the tasker says they didn’t receive it.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={'btn' + (filter === 'open' ? ' primary' : '')} onClick={() => setFilter('open')}>Open</button>
        <button className={'btn' + (filter === 'all' ? ' primary' : '')} onClick={() => setFilter('all')}>All</button>
      </div>
      {rows === null ? <p className="muted">Loading…</p> : rows.length === 0 ? <div className="card muted">No open cancellation fees.</div> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Booking</th><th>Client</th><th>Tasker</th><th>Amount</th><th>Status</th><th>Reference</th><th></th></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td><b>{f.booking?.code}</b><div className="muted">{when(f.created_at)}</div></td>
                <td>{f.client?.first_name} {f.client?.last_name}<div className="muted">{f.client?.email}</div></td>
                <td>{f.tasker?.first_name} {f.tasker?.last_name}<div className="muted">{f.tasker?.email}</div></td>
                <td>{peso(f.amount_php)}</td>
                <td><span className={'tag ' + (label[f.status]?.[1] ?? '')}>{label[f.status]?.[0] ?? f.status}</span></td>
                <td>{f.reference_no ?? '—'}{f.submitted_at && <div className="muted">{when(f.submitted_at)}</div>}</td>
                <td>{!['received', 'settled'].includes(f.status) && (
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn" onClick={() => set(f, 'received')}>Mark paid</button>
                    <button className="btn" onClick={() => set(f, 'settled')}>Waive</button>
                  </div>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}

function AccessLog() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    supabase.from('kyc_access_log')
      .select('id,action,created_at,admin:profiles!kyc_access_log_admin_id_fkey(first_name,last_name,email),ver:tasker_verifications!kyc_access_log_verification_id_fkey(user:profiles!tasker_verifications_user_id_fkey(first_name,last_name))')
      .order('created_at', { ascending: false }).limit(300).then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <>
      <p className="sub">Every time someone opens a tasker’s ID photos. Required for data privacy: review this regularly.</p>
      {rows === null ? <p className="muted">Loading…</p> : rows.length === 0 ? <div className="card muted">Nobody has opened ID photos yet.</div> : (
        <div className="tablewrap"><table>
          <thead><tr><th>When</th><th>Admin</th><th>Whose IDs</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{when(r.created_at)}</td>
                <td>{r.admin?.first_name} {r.admin?.last_name}<div className="muted">{r.admin?.email}</div></td>
                <td>{r.ver?.user?.first_name} {r.ver?.user?.last_name}</td>
                <td>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}

function Team({ me }: { me: Me }) {
  const [t, setT] = useState<{ admins: any[]; invites: any[] } | null>(null);
  const [f, setF] = useState({ first: '', last: '', email: '', role: 'admin' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const sup = me.role === 'superadmin';
  const load = async () => { try { setT(await rpc('admin_team')); } catch (e: any) { setMsg(e.message); } };
  useEffect(() => { load(); }, []);
  const invite = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await sendInvite(f.email, f.role, f.first, f.last);
      setMsg(r);
      setF({ first: '', last: '', email: '', role: 'admin' }); load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const sendInvite = async (email: string, role: string, first?: string, last?: string, resend = false) => {
    const { data, error } = await supabase.functions.invoke('admin-invite', {
      body: { email, role, first_name: first || null, last_name: last || null, origin: window.location.origin, resend },
    });
    if (error) {
      let m = error.message;
      try { const b = await (error as any).context?.json?.(); if (b?.error) m = b.error; } catch { /* keep message */ }
      throw new Error(m);
    }
    if (data?.result === 'added') return `${email} already had a TSKR login, so they’re an admin now. They’ll see the panel the next time they sign in.`;
    if (data?.result === 'invited_no_email') return data.warning;
    return `Invite email sent to ${email}. They open the link, set their own password, and they’re in. The link works once; use Resend if it expires.`;
  };
  const resend = async (i: any) => {
    try { const [first, ...rest] = (i.name || '').split(' '); alert(await sendInvite(i.email, i.role, first, rest.join(' '), true)); load(); }
    catch (e: any) { alert(e.message); }
  };
  const act = async (fn: string, args: any, ask: string) => {
    if (!confirm(ask)) return;
    try { await rpc(fn, args); load(); } catch (e: any) { alert(e.message); }
  };
  return (
    <>
      <p className="sub">People who can open this admin panel. <b>Superadmin</b> can do everything, including adding and removing admins. <b>Admin</b> can do everything except manage this list.</p>
      {sup ? (
        <div className="card" style={{ marginBottom: 20, gap: 10, display: 'flex', flexDirection: 'column' }}>
          <h2>Add an admin</h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="First name" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} />
            <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Last name" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} />
            <input className="input" style={{ flex: 2, minWidth: 220 }} type="email" placeholder="Their email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <select className="input" style={{ minWidth: 140 }} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="admin">Admin</option><option value="superadmin">Superadmin</option>
            </select>
            <button className="btn primary" disabled={busy || !f.email} onClick={invite}>{busy ? 'Please wait…' : 'Add admin'}</button>
          </div>
          <p className="muted">They get an email invite and set their own password, so you never need to know it.</p>
          {msg && <div className="note" style={{ wordBreak: 'break-word' }}>{msg}</div>}
        </div>
      ) : <div className="note" style={{ marginBottom: 20 }}>Only a superadmin can add or remove admins.</div>}
      {t === null ? <p className="muted">Loading…</p> : (
        <>
          <div className="tablewrap" style={{ marginBottom: 24 }}><table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead>
            <tbody>
              {t.admins.map((a) => (
                <tr key={a.user_id}>
                  <td><div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                    <Avatar path={a.photo} text={((a.name || a.email || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2)).toUpperCase()} />
                    <b>{a.name || '—'}</b>{a.user_id === me.id && <span className="tag">YOU</span>}
                  </div></td>
                  <td>{a.email}</td>
                  <td><span className={'tag' + (a.role === 'superadmin' ? ' ok' : '')}>{a.role.toUpperCase()}</span></td>
                  <td className="muted">{a.last_sign_in ? when(a.last_sign_in) : 'never'}</td>
                  <td>{sup && a.user_id !== me.id && (
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn" onClick={() => act('admin_set_role', { p_user: a.user_id, p_role: a.role === 'superadmin' ? 'admin' : 'superadmin' }, `Make ${a.name || a.email} ${a.role === 'superadmin' ? 'an Admin' : 'a Superadmin'}?`)}>
                        {a.role === 'superadmin' ? 'Make admin' : 'Make superadmin'}
                      </button>
                      <button className="btn danger" onClick={() => act('admin_remove', { p_user: a.user_id }, `Remove admin access for ${a.name || a.email}? Their TSKR login stays, but they can’t open this panel.`)}>Remove</button>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <h2 style={{ marginBottom: 10 }}>Waiting to sign up ({t.invites.length})</h2>
          <div className="list">
            {t.invites.length === 0 && <div className="card muted">No pending invites.</div>}
            {t.invites.map((i) => (
              <div key={i.email} className="card row between">
                <div><h2>{i.name || i.email}</h2><div className="muted">{i.email} · {i.role} · invited {when(i.at)}</div></div>
                {sup && <div className="row" style={{ gap: 6 }}>
                  <button className="btn" onClick={() => resend(i)}>Resend email</button>
                  <button className="btn" onClick={() => act('admin_cancel_invite', { p_email: i.email }, `Cancel the invite for ${i.email}?`)}>Cancel invite</button>
                </div>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Settings({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState('');
  const load = async () => { const { data } = await supabase.from('app_config').select('*').order('key'); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  const save = async (key: string) => {
    let value: unknown;
    try { value = JSON.parse(edit[key]); } catch { alert('Enter a number, true/false, or text in "quotes".'); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('app_config').update({ value, updated_at: new Date().toISOString(), updated_by: u.user?.id }).eq('key', key);
    if (error) { alert(error.message); return; }
    setSaved(key); setEdit({ ...edit, [key]: undefined as any }); load(); onChange();
    setTimeout(() => setSaved(''), 2000);
  };
  return (
    <>
      
      <p className="sub">Fees, limits and switches the apps read live. Changes apply right away. Rows marked PLACEHOLDER still need a final number from management.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Setting</th><th>Value</th><th>What it does</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const cur = JSON.stringify(r.value);
            const val = edit[r.key] ?? cur;
            return (
              <tr key={r.key}>
                <td><b>{r.key}</b> {r.status === 'placeholder' && <span className="tag warn">PLACEHOLDER</span>}</td>
                <td><input className="input" style={{ minWidth: 120 }} value={val} onChange={(e) => setEdit({ ...edit, [r.key]: e.target.value })} /></td>
                <td className="muted">{r.description}</td>
                <td>{val !== cur ? <button className="btn primary" onClick={() => save(r.key)}>Save</button> : saved === r.key ? <span className="tag ok">SAVED</span> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </>
  );
}
