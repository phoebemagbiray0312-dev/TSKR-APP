'use client';
import { useCallback, useEffect, useState } from 'react';
import { peso, rpc, supabase, when } from '../lib/supabase';

type Tab = 'overview' | 'applications' | 'reviews' | 'tickets' | 'strikes' | 'fees' | 'bookings' | 'users' | 'access' | 'settings' | 'profile';
type Overview = Record<string, number | boolean>;
type Me = { id: string; email: string; first_name: string; last_name: string; phone: string | null; role: string };

/* simple line icons (24px grid) */
const ICON: Record<string, string> = {
  overview: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  applications: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11l2 2 4-4',
  reviews: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3 2 2 4-4',
  tickets: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
  bookings: 'M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4',
  strikes: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 6 0',
  fees: 'M3 7h18v10H3V7Zm9 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 10v4m12-4v4',
  access: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6m2-6c3.3 0 6 2.7 6 6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3 2-1-2-4-2 1-2-2V4h-4v2L9 7 7 6 5 10l2 1v2l-2 1 2 4 2-1 2 2v2h4v-2l2-2 2 1 2-4-2-1v-2Z',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9c0-4.4 3.6-8 8-8s8 3.6 8 8',
};
const Icon = ({ name, size = 18 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICON[name]} />
  </svg>
);
const NAV: Partial<Record<Tab, string>> = { applications: 'Applications', reviews: 'QR and skills', tickets: 'Reports and SOS', strikes: 'Strikes and pauses', fees: 'Cancellation fees', access: 'ID access log' };
const initials = (m: Me | null) => ((m?.first_name?.[0] ?? '') + (m?.last_name?.[0] ?? '')).toUpperCase() || 'A';
const TITLES: Record<Tab, string> = {
  overview: 'Overview', applications: 'Tasker applications', reviews: 'QR and skill reviews', tickets: 'Reports and SOS',
  strikes: 'Strikes and pauses', fees: 'Cancellation fees', access: 'ID access log',
  bookings: 'Bookings', users: 'Users', settings: 'Settings', profile: 'My profile',
};

/* ------------------------------------------------------------------ */
/* Admin shell: login gate + sidebar                                    */
/* ------------------------------------------------------------------ */
export default function Admin() {
  const [state, setState] = useState<'loading' | 'out' | 'notadmin' | 'in'>('loading');
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
      supabase.from('admin_users').select('role').eq('user_id', u.user.id).maybeSingle(),
    ]);
    setMe({ id: u.user.id, email: u.user.email ?? '', first_name: p?.first_name ?? '', last_name: p?.last_name ?? '', phone: p?.phone ?? null, role: a?.role ?? 'admin' });
  }, []);
  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setState('out');
    setEmail(data.session.user.email ?? '');
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (isAdmin) loadMe();
    setState(isAdmin ? 'in' : 'notadmin');
  }, []);
  useEffect(() => { check(); }, []);
  const loadOv = useCallback(async () => { try { setOv(await rpc<Overview>('admin_overview')); } catch { /* not admin */ } }, []);
  useEffect(() => { if (state === 'in') loadOv(); }, [state, tab]);
  const signOut = async () => { await supabase.auth.signOut(); setMe(null); setState('out'); };

  if (state === 'loading') return <div className="login"><p className="muted">Loading…</p></div>;
  if (state === 'out') return <Login onDone={check} />;
  if (state === 'notadmin') return (
    <div className="login"><div className="card">
      <img src="/logo.png" alt="tskr" style={{ height: 30, alignSelf: 'flex-start', filter: 'brightness(0.3)' }} />
      <h2>No admin access yet</h2>
      <p className="muted">Signed in as <b>{email}</b>. Ask the TSKR owner to give this account admin access, then sign in again.</p>
      <button className="btn" onClick={signOut}>Sign out</button>
    </div></div>
  );

  const n = (k: string) => Number(ov?.[k] ?? 0);
  const items: [Tab, number?][] = [
    ['overview'], ['applications', n('applications')], ['reviews', n('qr_pending') + n('skills_pending')],
    ['tickets', n('tickets_open')], ['strikes'], ['fees'], ['bookings'], ['users'], ['access'], ['settings'],
  ];
  const name = me ? `${me.first_name} ${me.last_name}`.trim() || me.email : email;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src="/logo.png" alt="tskr" /><span className="badge">ADMIN</span></div>
        <div className="navlist">
          {items.map(([k, c]) => (
            <button key={k} className={'nav' + (tab === k ? ' on' : '')} onClick={() => go(k)}>
              <Icon name={k} /><span className="lbl">{NAV[k] ?? TITLES[k]}</span>{c ? <span className="count">{c}</span> : null}
            </button>
          ))}
        </div>
        <button className={'me' + (tab === 'profile' ? ' on' : '')} onClick={() => setTab('profile')}>
          <span className="avatar">{initials(me)}</span>
          <span className="who"><b>{name}</b><small>{me?.role ?? 'admin'}</small></span>
        </button>
        <button className="signout" onClick={signOut}>Sign out</button>
      </aside>
      <main>
        <div className="wrap">
          <header className="top">
            <h1>{TITLES[tab]}</h1>
            <button className="chip" onClick={() => setTab('profile')}><span className="avatar sm">{initials(me)}</span>{name}</button>
          </header>
          {ov && (tab === 'overview' || tab === 'settings') && (ov.demo_mode || ov.payments_demo) ? <div className="note" style={{ marginBottom: 16 }}>TEST BUILD: demo codes and demo payments are ON. Turn them off in Settings before launch.</div> : null}
          {tab === 'overview' && <OverviewTab ov={ov} go={go} />}
          {tab === 'applications' && <Applications onChange={loadOv} />}
          {tab === 'reviews' && <Reviews onChange={loadOv} />}
          {tab === 'tickets' && <Tickets onChange={loadOv} />}
          {tab === 'strikes' && <Strikes />}
          {tab === 'fees' && <Fees />}
          {tab === 'access' && <AccessLog />}
          {tab === 'bookings' && <Bookings key={preset} preset={preset} />}
          {tab === 'users' && <Users key={preset} preset={preset} />}
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
            <span className="avatar lg">{initials({ ...me, first_name: first, last_name: last })}</span>
            <div><h2>{`${first} ${last}`.trim() || 'Your name'}</h2><span className="tag">{me.role.toUpperCase()}</span></div>
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
  const [mode, setMode] = useState<'in' | 'up'>('in');
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
        if (pw.length < 10) throw new Error('Use at least 10 characters for the password.');
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: 'TSKR Admin' }, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (data.session) onDone();
        else setMsg('Login created. Ask the TSKR owner to confirm it and give it admin access, then sign in.');
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="card">
        <div className="row"><img src="/logo.png" alt="tskr" style={{ height: 30, filter: 'brightness(0.3)' }} /><span className="badge">ADMIN</span></div>
        <h2>{mode === 'in' ? 'Sign in' : 'Create an admin login'}</h2>
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <div className="pw">
          <input className="input" type={showPw ? 'text' : 'password'} placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} onKeyDown={(e) => e.key === 'Enter' && go()} />
          <button type="button" className="eye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
        {err && <div className="err">{err}</div>}
        {msg && <div className="note">{msg}</div>}
        <button className="btn primary" disabled={busy || !email || !pw} onClick={go}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create login'}</button>
        <button className="btn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setMsg(''); }}>
          {mode === 'in' ? 'First time? Create an admin login' : 'I already have a login'}
        </button>
        <p className="muted">Only accounts given admin access by the owner can see this panel.</p>
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

const US_FILTERS: [string, string][] = [['all', 'All'], ['clients', 'Clients'], ['taskers', 'Active taskers'], ['online', 'Online now']];
function Users({ preset }: { preset?: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [hideDemo, setHideDemo] = useState(true);
  const [f, setF] = useState(preset || 'all');
  const load = async () => {
    const cols = 'id,first_name,last_name,email,phone,signup_role,is_tasker,tasker_status,status,plan,is_demo,created_at';
    let s = supabase.from('profiles').select(f === 'online' ? cols + ',tp:tasker_profiles!tasker_profiles_user_id_fkey!inner(is_online)' : cols)
      .order('created_at', { ascending: false }).limit(300);
    if (hideDemo) s = s.eq('is_demo', false);
    if (f === 'clients') s = s.eq('is_tasker', false);
    if (f === 'taskers') s = s.eq('is_tasker', true).eq('tasker_status', 'active');
    if (f === 'online') s = s.eq('tp.is_online', true);
    if (q.trim()) s = s.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`);
    const { data } = await s; setRows(data ?? []);
  };
  useEffect(() => { load(); }, [hideDemo, f]);
  const coinsFor = async (u: any) => {
    try {
      const bal = await rpc<number>('admin_coin_balance', { p_tasker: u.id });
      const amt = prompt(`${u.first_name} ${u.last_name} has ${bal.toLocaleString()} coins.\n\nCoins to add (use a minus sign to deduct, e.g. -300):`);
      if (!amt) return;
      const n = parseInt(amt, 10); if (!n) { alert('Enter a whole number.'); return; }
      const why = prompt('Reason (the tasker will see this):'); if (!why) return;
      const nb = await rpc<number>('admin_adjust_coins', { p_tasker: u.id, p_amount: n, p_note: why });
      alert(`Done. New balance: ${nb.toLocaleString()} coins.`);
    } catch (e: any) { alert(e.message); }
  };
  const toggle = async (u: any) => {
    const active = u.status !== 'active';
    if (!confirm(`${active ? 'Restore' : 'Suspend'} ${u.first_name} ${u.last_name}?`)) return;
    try { await rpc('admin_set_account', { p_user: u.id, p_active: active }); load(); } catch (e: any) { alert(e.message); }
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
                <td><b>{u.first_name} {u.last_name}</b> {u.is_demo && <span className="tag warn">DEMO</span>}</td>
                <td>{u.email}<div className="muted">{u.phone ? `+63 ${u.phone}` : 'no mobile'}</div></td>
                <td>{u.signup_role}{u.is_tasker ? <div className="muted">tasker · {u.tasker_status}</div> : u.tasker_status !== 'none' ? <div className="muted">tasker {u.tasker_status}</div> : null}</td>
                <td>{u.plan}</td>
                <td><span className={'tag ' + (u.status === 'active' ? 'ok' : 'err')}>{u.status}</span></td>
                <td>{when(u.created_at)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  {(u.is_tasker || u.tasker_status !== 'none') && <button className="btn" onClick={() => coinsFor(u)}>Coins</button>}
                  <button className={'btn ' + (u.status === 'active' ? 'danger' : '')} onClick={() => toggle(u)}>{u.status === 'active' ? 'Suspend' : 'Restore'}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}

function Strikes() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [pauses, setPauses] = useState<any[]>([]);
  const load = async () => {
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
