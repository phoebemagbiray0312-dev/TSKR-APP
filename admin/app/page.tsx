'use client';
import { useCallback, useEffect, useState } from 'react';
import { peso, rpc, supabase, when } from '../lib/supabase';

type Tab = 'overview' | 'applications' | 'reviews' | 'tickets' | 'bookings' | 'users' | 'settings';
type Overview = Record<string, number | boolean>;

/* ------------------------------------------------------------------ */
/* Admin shell: login gate + sidebar                                    */
/* ------------------------------------------------------------------ */
export default function Admin() {
  const [state, setState] = useState<'loading' | 'out' | 'notadmin' | 'in'>('loading');
  const [email, setEmail] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [ov, setOv] = useState<Overview | null>(null);

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setState('out');
    setEmail(data.session.user.email ?? '');
    const { data: isAdmin } = await supabase.rpc('is_admin');
    setState(isAdmin ? 'in' : 'notadmin');
  }, []);
  useEffect(() => { check(); }, []);
  const loadOv = useCallback(async () => { try { setOv(await rpc<Overview>('admin_overview')); } catch { /* not admin */ } }, []);
  useEffect(() => { if (state === 'in') loadOv(); }, [state, tab]);

  if (state === 'loading') return <div className="login"><p className="muted">Loading…</p></div>;
  if (state === 'out') return <Login onDone={check} />;
  if (state === 'notadmin') return (
    <div className="login"><div className="card">
      <img src="/logo.png" alt="tskr" style={{ height: 30, alignSelf: 'flex-start', filter: 'brightness(0.3)' }} />
      <h2>No admin access yet</h2>
      <p className="muted">Signed in as <b>{email}</b>. Ask the TSKR owner to give this account admin access, then sign in again.</p>
      <button className="btn" onClick={async () => { await supabase.auth.signOut(); setState('out'); }}>Sign out</button>
    </div></div>
  );

  const n = (k: string) => Number(ov?.[k] ?? 0);
  const items: [Tab, string, number?][] = [
    ['overview', 'Overview'], ['applications', 'Tasker applications', n('applications')],
    ['reviews', 'QR and skill reviews', n('qr_pending') + n('skills_pending')], ['tickets', 'Reports and SOS', n('tickets_open')],
    ['bookings', 'Bookings'], ['users', 'Users'], ['settings', 'Settings'],
  ];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src="/logo.png" alt="tskr" /><span className="badge">ADMIN</span></div>
        {items.map(([k, l, c]) => (
          <button key={k} className={'nav' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            <span>{l}</span>{c ? <span className="count">{c}</span> : null}
          </button>
        ))}
        <div className="foot">
          <div>{email}</div>
          <button onClick={async () => { await supabase.auth.signOut(); setState('out'); }}>Sign out</button>
        </div>
      </aside>
      <main>
        {ov && (ov.demo_mode || ov.payments_demo) ? <div className="note" style={{ marginBottom: 16 }}>TEST BUILD: demo codes and demo payments are ON. Turn them off in Settings before launch.</div> : null}
        {tab === 'overview' && <OverviewTab ov={ov} go={setTab} />}
        {tab === 'applications' && <Applications onChange={loadOv} />}
        {tab === 'reviews' && <Reviews onChange={loadOv} />}
        {tab === 'tickets' && <Tickets onChange={loadOv} />}
        {tab === 'bookings' && <Bookings />}
        {tab === 'users' && <Users />}
        {tab === 'settings' && <Settings onChange={loadOv} />}
      </main>
    </div>
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
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: 'TSKR Admin' } } });
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
function OverviewTab({ ov, go }: { ov: Overview | null; go: (t: Tab) => void }) {
  if (!ov) return <p className="muted">Loading…</p>;
  const s = (k: string, label: string, alert?: boolean, tab?: Tab) => (
    <div className={'card stat' + (alert && Number(ov[k]) > 0 ? ' alert' : '')} style={{ cursor: tab ? 'pointer' : 'default' }} onClick={() => tab && go(tab)}>
      <div className="v">{String(ov[k] ?? 0)}</div><div className="k">{label}</div>
    </div>
  );
  return (
    <>
      <h1>Overview</h1><p className="sub">What needs attention today.</p>
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
        {s('users', 'Users (not demo)')}{s('taskers', 'Active taskers')}{s('online', 'Taskers online now')}
        {s('bookings_today', 'Bookings today', false, 'bookings')}{s('active_bookings', 'Bookings in progress', false, 'bookings')}{s('completed_total', 'Completed bookings')}
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
      <h1>Tasker applications</h1>
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
      <h1>QR and skill reviews</h1>
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
      <h1>Reports and SOS</h1>
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

function Bookings() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const load = async () => {
    let s = supabase.from('bookings')
      .select('id,code,status,created_at,when_type,starting_total,initial_offer,final_price,fee_coins,cancel_reason,client:profiles!bookings_client_id_fkey(first_name,last_name,is_demo),tasker:profiles!bookings_tasker_id_fkey(first_name,last_name,is_demo)')
      .order('created_at', { ascending: false }).limit(200);
    if (q.trim()) s = s.ilike('code', `%${q.trim()}%`);
    const { data } = await s; setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);
  return (
    <>
      <h1>Bookings</h1><p className="sub">Latest 200. Search by booking code.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" placeholder="BK-…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn" onClick={load}>Search</button>
      </div>
      {rows === null ? <p className="muted">Loading…</p> : (
        <table>
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
        </table>
      )}
    </>
  );
}

function Users() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [hideDemo, setHideDemo] = useState(true);
  const load = async () => {
    let s = supabase.from('profiles').select('id,first_name,last_name,email,phone,signup_role,is_tasker,tasker_status,status,plan,is_demo,created_at')
      .order('created_at', { ascending: false }).limit(300);
    if (hideDemo) s = s.eq('is_demo', false);
    if (q.trim()) s = s.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`);
    const { data } = await s; setRows(data ?? []);
  };
  useEffect(() => { load(); }, [hideDemo]);
  const toggle = async (u: any) => {
    const active = u.status !== 'active';
    if (!confirm(`${active ? 'Restore' : 'Suspend'} ${u.first_name} ${u.last_name}?`)) return;
    try { await rpc('admin_set_account', { p_user: u.id, p_active: active }); load(); } catch (e: any) { alert(e.message); }
  };
  return (
    <>
      <h1>Users</h1><p className="sub">Search by name, email or mobile number.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn" onClick={load}>Search</button>
        <label className="muted"><input type="checkbox" checked={hideDemo} onChange={(e) => setHideDemo(e.target.checked)} /> Hide demo accounts</label>
      </div>
      {rows === null ? <p className="muted">Loading…</p> : (
        <table>
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
                <td><button className={'btn ' + (u.status === 'active' ? 'danger' : '')} onClick={() => toggle(u)}>{u.status === 'active' ? 'Suspend' : 'Restore'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <h1>Settings</h1>
      <p className="sub">Fees, limits and switches the apps read live. Changes apply right away. Rows marked PLACEHOLDER still need a final number from management.</p>
      <table>
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
      </table>
    </>
  );
}
