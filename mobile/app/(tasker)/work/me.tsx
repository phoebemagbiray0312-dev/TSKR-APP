import React, { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, font } from '../../../src/theme';
import { ErrorText, T } from '../../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../../src/components/glass';
import { CAT_ICON, Chip, HeaderFill, HeaderLogo, Ic, P, Toast, glassCard } from '../../../src/components/clientUi';
import { Circle, Path } from 'react-native-svg';
import { peso, useClient } from '../../../src/lib/client';
import { TaskerHome, loadTaskerHome, uploadImage } from '../../../src/lib/tasker';
import { rpc, supabase } from '../../../src/lib/supabase';

type TP = { nickname: string | null; bio: string | null; title: string | null; years_experience: number | null; photo_path: string | null; qr_wallet_type: string | null; qr_account_name: string | null; qr_status: string; payment_qr_path: string | null };

/** Design (Nov 14): tasker ME — mode switch, my office, earnings, Top Tasker, payment QR, availability, portfolio, job history, reliability, account. */
export default function Me() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [h, setH] = useState<TaskerHome | null>(null);
  const [tp, setTp] = useState<TP | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [wallet, setWallet] = useState('gcash');
  const [acct, setAcct] = useState('');
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // my office
  const [editing, setEditing] = useState(false);
  const [nick, setNick] = useState('');
  const [about, setAbout] = useState('');
  const [jt, setJt] = useState('');
  const [yrs, setYrs] = useState('');
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [office, setOffice] = useState<{ id: string; path: string; taken: string; url: string | null }[]>([]);
  const [top, setTop] = useState<any>(null);
  const [portBusy, setPortBusy] = useState(false);
  const [offErr, setOffErr] = useState('');
  const [offBusy, setOffBusy] = useState(false);
  // earnings
  const [done, setDone] = useState<{ amt: number; at: Date }[]>([]);
  const [earnTab, setEarnTab] = useState<'week' | 'month'>('week');
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrEdit, setQrEdit] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  // availability
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('18:00');
  const [availDirty, setAvailDirty] = useState(false);
  // emergency contact
  const [emName, setEmName] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [emSaved, setEmSaved] = useState('');
  const [emErr, setEmErr] = useState('');

  const load = useCallback(async () => {
    const home = await loadTaskerHome(); setH(home);
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from('tasker_profiles').select('nickname,bio,title,years_experience,photo_path,qr_wallet_type,qr_account_name,qr_status,payment_qr_path').eq('user_id', u.user!.id).maybeSingle();
    const t = data as TP | null; setTp(t);
    setAcct((a) => a || t?.qr_account_name || home.full_name);
    if (t?.qr_wallet_type) setWallet(t.qr_wallet_type);
    if (t?.photo_path) { const s = await supabase.storage.from('tasker-media').createSignedUrl(t.photo_path, 3600); setPhotoUrl(s.data?.signedUrl ?? null); }
    const uid = u.user!.id;
    const [pf, bk, pr, sk, jb, av] = await Promise.all([
      supabase.from('portfolio_photos').select('id,photo_path,taken_at').eq('tasker_id', uid).order('taken_at', { ascending: false }).limit(12),
      supabase.from('bookings').select('final_price,initial_offer,completed_at').eq('tasker_id', uid).eq('status', 'completed'),
      supabase.from('profiles').select('emergency_contact_name,emergency_contact_phone').eq('id', uid).maybeSingle(),
      supabase.from('tasker_skills').select('custom_name,slot,skill:skills!tasker_skills_skill_id_fkey(name)').eq('tasker_id', uid).eq('status', 'active').order('slot'),
      rpc<any[]>('tasker_jobs'),
      supabase.from('tasker_profiles').select('availability').eq('user_id', uid).maybeSingle(),
    ]);
    setSkillNames(((sk.data ?? []) as any[]).map((k) => k.custom_name ?? k.skill?.name).filter(Boolean));
    const past = (jb ?? []).filter((j: any) => !j.active).slice(0, 10);
    if (past.length) {
      const { data: extra } = await supabase.from('bookings').select('id,client_id,payment_method,cancelled_by,completed_at,cancelled_at,fee_coins').in('id', past.map((j: any) => j.id));
      const m = new Map(((extra ?? []) as any[]).map((x) => [x.id, x]));
      setJobs(past.map((j: any) => ({ ...j, ...(m.get(j.id) ?? {}) })));
    } else setJobs([]);
    const a = av.data?.availability as { days: number[]; from: string; to: string } | null;
    if (a && !availDirty) { setDays(a.days); setFrom(a.from); setTo(a.to); }
    if (t?.payment_qr_path) { const q = await supabase.storage.from('tasker-media').createSignedUrl(t.payment_qr_path, 3600); setQrUrl(q.data?.signedUrl ?? null); }
    const rows = (pf.data ?? []) as any[];
    const signed = rows.length ? (await supabase.storage.from('tasker-media').createSignedUrls(rows.map((r) => r.photo_path), 3600)).data ?? [] : [];
    setOffice(rows.map((r, i) => ({ id: r.id, path: r.photo_path, taken: r.taken_at, url: signed[i]?.signedUrl ?? null })));
    rpc('tasker_top_status', { p_tasker: uid }).then(setTop).catch(() => {});
    setDone(((bk.data ?? []) as any[]).map((r) => ({ amt: Number(r.final_price ?? r.initial_offer ?? 0), at: r.completed_at ? new Date(r.completed_at) : new Date() })));
    setEmName((v) => v || pr.data?.emergency_contact_name || ''); setEmPhone((v) => v || pr.data?.emergency_contact_phone || '');
  }, []);

  const startEdit = () => { setNick(tp?.nickname ?? ''); setAbout(tp?.bio ?? ''); setJt(tp?.title ?? ''); setYrs(tp?.years_experience ? String(tp.years_experience) : ''); setNewPhoto(null); setOffErr(''); setEditing(true); };
  const takeSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setOffErr('Allow camera access in Settings to take your photo.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, cameraType: ImagePicker.CameraType.front, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled) setNewPhoto(r.assets[0].uri);
  };
  const addPortfolio = async () => {
    if (office.length >= 12) { showToast('Up to 12 photos. Remove one first.'); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { showToast('Allow camera access in Settings to add work photos.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled) return;
    setPortBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = await uploadImage('tasker-media', u.user!.id, r.assets[0].uri, 'work');
      await rpc('add_portfolio_photo', { p_path: path });
      showToast('Photo added to your portfolio'); load();
    } catch (e: any) { showToast(e.message); } finally { setPortBusy(false); }
  };
  const removePortfolio = (id: string) => Alert.alert('Remove this photo?', 'Clients won’t see it on your profile anymore.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await rpc('remove_portfolio_photo', { p_id: id }); load(); } catch (e: any) { showToast(e.message); } } },
  ]);
  const saveOffice = async () => {
    setOffErr('');
    if (!nick.trim()) { setOffErr('Add a nickname.'); return; }
    const t = jt.trim();
    if (t && (/\d{3,}/.test(t) || /(https?:\/\/|www\.|\.com\b|facebook|viber|whatsapp|telegram|@[a-z])/i.test(t))) { setOffErr('No numbers or contact details in your job title.'); return; }
    if (t && /doctor|doktor|nurse|therap|dentist|lawyer|attorney|abogado|notar|pharmacist|engineer|architect|psycholog/i.test(t)) { setOffErr('Job titles for licensed professions aren’t allowed on TSKR.'); return; }
    setOffBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser(); const uid = u.user!.id;
      const photo = newPhoto ? await uploadImage('tasker-media', uid, newPhoto, 'profile') : tp?.photo_path;
      if (!photo) throw new Error('Add a profile photo to continue.');
      await rpc('save_tasker_office', { p_nickname: nick.trim(), p_about: about.trim(), p_photo_path: photo, p_office_paths: [] });
      await rpc('save_tasker_title', { p_title: jt.trim(), p_years: yrs ? Number(yrs) : null });
      setEditing(false); showToast('My office saved'); load();
    } catch (e: any) { setOffErr(e.message); } finally { setOffBusy(false); }
  };
  const saveEmergency = async () => {
    setEmErr(''); setEmSaved('');
    const digits = emPhone.replace(/\D/g, '').replace(/^63/, '').replace(/^0/, '');
    if (!emName.trim()) { setEmErr('Enter their name.'); return; }
    if (!/^9\d{9}$/.test(digits)) { setEmErr('Enter a PH mobile number, like 917 123 4567.'); return; }
    try { await rpc('update_my_profile', { p_emergency_name: emName.trim(), p_emergency_phone: digits }); setEmPhone(digits); setEmSaved('Saved. Our safety team calls them only in an emergency.'); }
    catch (e: any) { setEmErr(e.message); }
  };
  const pauseAccount = () => Alert.alert('Pause your tasker account?', 'You’ll go offline and clients won’t see you. Sign in again anytime to come back.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Pause', style: 'destructive', onPress: async () => {
      try { await rpc('close_account', { p_mode: 'deactivated', p_reason: 'taking_a_break', p_note: 'Paused from tasker Me' }); await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }
      catch (e: any) { showToast(e.message); }
    } },
  ]);
  useFocusEffect(useCallback(() => { load().catch((e) => showToast(e.message)); }, []));

  const pickQr = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled) setQrUri(r.assets[0].uri);
  };
  const saveQr = async () => {
    setErr('');
    if (!qrUri) { setErr('Choose your QR image first.'); return; }
    if (!acct.trim()) { setErr('Enter the account name on the QR.'); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = await uploadImage('tasker-media', u.user!.id, qrUri, 'payment-qr');
      const st = await rpc<string>('set_payment_qr', { p_path: path, p_wallet: wallet, p_account_name: acct.trim() });
      setQrUri(null);
      showToast(st === 'approved' ? 'Payment QR saved' : 'Saved. The name doesn’t match your ID, so our team will review it.');
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const saveAvail = async () => {
    try { await rpc('set_availability', { p_days: days, p_from: from, p_to: to }); setAvailDirty(false); showToast('Availability saved'); }
    catch (e: any) { showToast(e.message); }
  };
  const closeAccount = (mode: 'deactivated' | 'deleted') => Alert.alert(
    mode === 'deleted' ? 'Delete your account?' : 'Deactivate your account?',
    mode === 'deleted' ? 'Your profile, skills and saved addresses are removed. Booking records are kept as the law requires. This can’t be undone.' : 'You go offline and clients won’t see you. Sign in again anytime to come back.',
    [{ text: 'Cancel', style: 'cancel' },
      { text: mode === 'deleted' ? 'Delete' : 'Deactivate', style: 'destructive', onPress: async () => {
        try { await rpc('close_account', { p_mode: mode, p_reason: mode === 'deleted' ? 'delete_from_me' : 'taking_a_break', p_note: 'From tasker Me' }); await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }
        catch (e: any) { showToast(e.message); }
      } }]);

  // earnings: this week (Mon–Sun) by day, or this month by week
  const now = new Date();
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const inRange = done.filter((d) => d.at >= (earnTab === 'week' ? monday : monthStart));
  const total = inRange.reduce((a, d) => a + d.amt, 0);
  const bars = earnTab === 'week'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((l, i) => ({ l, v: inRange.filter((d) => (d.at.getDay() + 6) % 7 === i).reduce((a, d) => a + d.amt, 0) }))
    : [1, 2, 3, 4, 5].map((w) => ({ l: `Wk ${w}`, v: inRange.filter((d) => Math.min(5, Math.ceil(d.at.getDate() / 7)) === w).reduce((a, d) => a + d.amt, 0) }));
  const maxBar = Math.max(1, ...bars.map((b) => b.v));
  const fmt = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const rangeText = earnTab === 'week' ? `${fmt(monday)} – ${fmt(new Date(monday.getTime() + 6 * 864e5))}` : now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const masked = (() => { const f = (h?.full_name ?? '').trim().split(/\s+/); const first = f[0] ?? ''; const last = f[f.length - 1] ?? '';
    return `${(first.slice(0, 2) + (first.length > 3 ? '*' : '') + first.slice(-1)).toUpperCase()} ${last.charAt(0).toUpperCase()}.`; })();
  const titleLine = tp?.title ? `${tp.title}${tp.years_experience ? ` · ${tp.years_experience} ${tp.years_experience === 1 ? 'yr' : 'yrs'}` : ''}` : null;

  const qrTag = tp?.qr_status === 'approved' ? 'APPROVED' : tp?.qr_status === 'pending' ? 'UNDER REVIEW' : tp?.qr_status === 'rejected' ? 'REJECTED' : 'MISSING';

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <HeaderFill />
        <View style={st.rowB}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HeaderLogo height={26} />
            <View style={st.badge}><T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.6 }}>TASKER</T></View>
          </View>
          <View style={[st.onPill, !h?.online && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <View style={[st.onDot, !h?.online && { backgroundColor: '#CFE3E7' }]} />
            <T w="extrabold" style={{ fontSize: 13, color: h?.online ? colors.teal : '#FFF' }}>{h?.online ? 'Online' : 'Offline'}</T>
          </View>
        </View>
        <View style={[st.rowB, { marginTop: 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={st.headAvatar}>{photoUrl ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} /> : <Ic d={P.navUser} size={20} color={colors.muted} />}</View>
            <View style={{ flex: 1 }}>
              <T w="extrabold" style={{ color: '#FFF', fontSize: 18 }} numberOfLines={1}>{h?.short_name}</T>
              <T style={{ color: colors.heroSub, fontSize: 13 }} numberOfLines={1}>{titleLine ?? h?.area_label ?? 'Add your job title in My office'}</T>
            </View>
          </View>
          <PressScale onPress={() => router.replace('/work/wallet')} style={st.coinBtn} accessibilityLabel="Coin balance">
            <Ic size={16} color={colors.teal} w={2.2}><Circle cx={12} cy={12} r={8} /><Path d="M12 8v8" /></Ic>
            <T w="extrabold" style={{ fontSize: 14, color: '#FFF' }}>{(h?.coins ?? 0).toLocaleString('en-PH')}</T>
          </PressScale>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 130, gap: 14 }}>
        <T w="extrabold" style={{ fontSize: 17 }}>How do you want to use TSKR now?</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PressScale outer={{ flex: 1 }} onPress={() => router.replace('/home')} style={[glassCard, st.modeCard]}>
            <View style={st.modeIcon}><Ic size={20} d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" /></View>
            <T w="extrabold" style={{ fontSize: 17 }}>Client</T>
            <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Book services for my home or family</T>
            <View style={st.modePill}><T w="extrabold" style={{ fontSize: 12 }}>Switch →</T></View>
          </PressScale>
          <View style={[st.modeCard, { flex: 1, backgroundColor: '#0B5566', borderColor: colors.green, borderWidth: 2 }]}>
            <View style={[st.modeIcon, { backgroundColor: 'rgba(255,255,255,0.14)' }]}><Ic size={20} color="#FFF" d={CAT_ICON.repairs} /></View>
            <T w="extrabold" style={{ fontSize: 17, color: '#FFF' }}>Tasker</T>
            <T style={{ fontSize: 12, color: colors.heroSub, lineHeight: 17 }}>Get job requests and earn</T>
            <View style={[st.modePill, { backgroundColor: colors.green }]}><T w="extrabold" style={{ fontSize: 12 }}>✓ You’re here</T></View>
          </View>
        </View>
        <T style={{ fontSize: 12, color: colors.muted, marginTop: -6 }}>Switch anytime. You can’t book your own tasker profile.</T>

        {/* ---------- My office ---------- */}
        <View style={[st.rowB, { marginTop: 4 }]}>
          <T w="extrabold" style={{ fontSize: 18 }}>My office</T>
          <T w="semibold" style={{ fontSize: 12, color: colors.body }}>Your face shows only after a booking</T>
        </View>
        <Rise i={1} style={[glassCard, { overflow: 'hidden' }]}>
          <View style={st.banner}>
            {[['#0B6F86', CAT_ICON.repairs], ['#1F6B4E', P.navHome], ['#0E5A6E', 'M4 5h16v14H4zM8 15l3-3 3 3 2-2 2 2M9 9h.01'], ['#2D7A55', P.star]].map(([bg, d], i) => (
              <View key={i} style={[st.bannerTile, { backgroundColor: bg }]}><Ic size={20} color="#E7F6EF" d={d} /></View>
            ))}
            <View style={st.officeTag}><T w="extrabold" style={{ fontSize: 10, letterSpacing: 0.8 }}>TSKR OFFICE</T></View>
          </View>
          <View style={{ padding: 16, paddingTop: 0, gap: 6 }}>
            <PressScale disabled={!editing} onPress={takeSelfie} accessibilityLabel="Retake profile photo" style={st.officePhoto}>
              {newPhoto || photoUrl ? <Image source={{ uri: newPhoto ?? photoUrl! }} style={StyleSheet.absoluteFill} /> : <Ic d={P.navUser} size={30} color={colors.muted} />}
            </PressScale>
            {editing ? (
              <>
                <T w="bold" style={{ fontSize: 13 }} onPress={takeSelfie}>{newPhoto ? '✓ New photo · retake' : 'Retake photo (camera)'}</T>
                <T w="semibold" style={{ fontSize: 13 }}>Nickname</T>
                <TextInput value={nick} onChangeText={setNick} maxLength={20} placeholder="e.g. Kuya Jun" placeholderTextColor="#98A2B3" accessibilityLabel="Nickname" style={st.input} />
                <T w="semibold" style={{ fontSize: 13 }}>Job title · {jt.length}/40</T>
                <TextInput value={jt} onChangeText={(v) => setJt(v.slice(0, 40))} placeholder="e.g. Aircon technician" placeholderTextColor="#98A2B3" accessibilityLabel="Job title" style={st.input} />
                <T style={{ fontSize: 12, color: colors.muted }}>Shown under your nickname. Keep it to the work you actually do, in English.</T>
                <T w="semibold" style={{ fontSize: 13 }}>Years of experience <T style={{ fontSize: 12, color: colors.muted }}>(optional)</T></T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput value={yrs} onChangeText={(v) => { const n = parseInt(v.replace(/\D/g, ''), 10); setYrs(n > 0 ? String(Math.min(n, 60)) : ''); }} keyboardType="number-pad" placeholder="8" placeholderTextColor="#98A2B3" accessibilityLabel="Years of experience" style={[st.input, { width: 80 }]} />
                  <T style={{ fontSize: 14, color: colors.body }}>years doing this work</T>
                </View>
                <T style={{ fontSize: 12, color: colors.muted }}>Shown next to your job title, like “Aircon technician · 8 yrs”. Leave blank to hide it.</T>
                <T w="semibold" style={{ fontSize: 13 }}>About · {about.length}/300</T>
                <TextInput value={about} onChangeText={setAbout} maxLength={300} multiline placeholder="Your experience, tools, what you’re good at" placeholderTextColor="#98A2B3"
                  accessibilityLabel="About" style={[st.input, { height: 110, paddingTop: 12, textAlignVertical: 'top' }]} />
                <T style={{ fontSize: 12, color: colors.muted }}>No phone numbers, links or social media.</T>
                <ErrorText>{offErr}</ErrorText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PressScale outer={{ flex: 1 }} onPress={() => setEditing(false)} style={st.ghost}><T w="bold" style={{ fontSize: 14 }}>Cancel</T></PressScale>
                  <View style={{ flex: 1.6 }}><GlossyButton label="Save my office" loading={offBusy} onPress={saveOffice} /></View>
                </View>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T w="extrabold" style={{ fontSize: 24 }}>{tp?.nickname ?? h?.short_name}</T>
                  <View style={st.verified}><Ic d={P.check} size={11} color="#FFF" w={3.2} /></View>
                </View>
                <T style={{ fontSize: 13, color: colors.body }}>Real name: {masked} · ID verified</T>
                {!!titleLine && <T w="extrabold" style={{ fontSize: 16 }}>{titleLine}</T>}
                {skillNames.length > 0 && <T w="bold" style={{ fontSize: 13, color: colors.body }}>{skillNames.join(' · ')}</T>}
                {!!tp?.bio && <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>{tp.bio}</T>}
              </>
            )}
          </View>
        </Rise>
        {!editing && <GlossyButton label="Edit my office" onPress={startEdit} />}

        {/* ---------- Earnings ---------- */}
        <Rise i={2} style={st.earnCard}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 15, color: colors.heroSub }}>Earnings</T>
            <View style={st.seg}>
              {(['week', 'month'] as const).map((k) => (
                <PressScale key={k} onPress={() => setEarnTab(k)} style={[st.segBtn, earnTab === k && { backgroundColor: colors.green }]}>
                  <T w="extrabold" style={{ fontSize: 12, color: earnTab === k ? colors.teal : '#FFF' }}>{k === 'week' ? 'This week' : 'This month'}</T>
                </PressScale>
              ))}
            </View>
          </View>
          <T w="extrabold" style={{ fontSize: 34, color: '#FFF', marginTop: 8 }}>{peso(total)}</T>
          <T style={{ fontSize: 13, color: colors.heroSub }}>{inRange.length} {inRange.length === 1 ? 'job' : 'jobs'} · {rangeText}</T>
          <View style={st.bars}>
            {bars.map((b) => (
              <View key={b.l} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{ height: 90, width: '78%', justifyContent: 'flex-end' }}>
                  <View style={{ height: Math.max(4, (b.v / maxBar) * 90), borderRadius: 6, backgroundColor: b.v ? colors.green : 'rgba(255,255,255,0.25)' }} />
                </View>
                <T w="bold" style={{ fontSize: 11, color: colors.heroSub }}>{b.l}</T>
              </View>
            ))}
          </View>
          <T style={{ fontSize: 12, color: colors.heroSub, lineHeight: 17, marginTop: 6 }}>Amounts you collected directly from clients for jobs booked in TSKR. Coin fees are shown in Wallet.</T>
        </Rise>
        {top && (
          <Rise i={2} style={[glassCard, { padding: 16, gap: 10 }, top.is_top && { borderColor: colors.green, borderWidth: 1.5 }]}>
            <View style={st.rowB}>
              <T w="extrabold" style={{ fontSize: 18 }}>Top Tasker</T>
              <View style={[st.tag, { backgroundColor: top.is_top ? '#E9F8E6' : colors.warnBg }]}><T w="extrabold" style={{ fontSize: 11, color: top.is_top ? '#2E7D32' : colors.warnText }}>{top.is_top ? '★ TOP TASKER' : 'ALMOST THERE'}</T></View>
            </View>
            <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Top Taskers get a badge on their profile. Only bookings made in TSKR count.</T>
            {([
              [`Rating ${top.min_rating} or higher`, top.rating > 0 ? String(top.rating) : '—', top.rating >= top.min_rating],
              [`${top.min_jobs_30d}+ jobs in the last 30 days`, `${top.jobs_30d} of ${top.min_jobs_30d}`, top.jobs_30d >= top.min_jobs_30d],
              [`${top.min_completion_pct}%+ jobs completed`, `${top.completion_pct}%`, top.completion_pct >= top.min_completion_pct],
              ['No strikes in 90 days', String(top.strikes_90d), top.strikes_90d === 0],
            ] as [string, string, boolean][]).map(([l, v, ok]) => (
              <View key={l} style={[st.rowB, { gap: 10 }]}>
                <View style={[st.dot, ok && { backgroundColor: colors.green, borderColor: colors.green }]}>{ok && <Ic d={P.check} size={12} color={colors.teal} w={3} />}</View>
                <T style={{ fontSize: 14, flex: 1 }}>{l}</T>
                <T w="extrabold" style={{ fontSize: 14 }}>{v}</T>
              </View>
            ))}
          </Rise>
        )}

        {/* ---------- Payment QR ---------- */}
        <Rise i={3} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 18 }}>Payment QR</T>
            <View style={[st.tag, { backgroundColor: tp?.qr_status === 'approved' ? '#E9F8E6' : colors.warnBg }]}><T w="extrabold" style={{ fontSize: 11, color: tp?.qr_status === 'approved' ? '#2E7D32' : colors.warnText }}>{tp?.qr_status === 'approved' ? 'SHOWN TO CLIENTS' : qrTag}</T></View>
          </View>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Clients see it only after they accept your offer. They use it to pay you for the job and for the ₱100 late-cancellation fee. TSKR doesn’t hold this money.</T>
          {tp?.payment_qr_path && !qrEdit ? (
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <View style={st.qrBox}>{qrUrl ? <Image source={{ uri: qrUrl }} style={{ width: 110, height: 110 }} resizeMode="contain" /> : null}</View>
              <View style={{ flex: 1, gap: 6 }}>
                <T w="extrabold" style={{ fontSize: 16 }}>{({ gcash: 'GCash', maya: 'Maya', bank: 'Bank' } as any)[tp.qr_wallet_type ?? ''] ?? 'E-wallet'}</T>
                <T style={{ fontSize: 13, color: colors.body, lineHeight: 18 }}>Account name must match your ID: {h?.full_name}</T>
                <PressScale onPress={() => setQrEdit(true)} style={st.smallBtn}><T w="extrabold" style={{ fontSize: 13 }}>Replace QR</T></PressScale>
              </View>
            </View>
          ) : (
            <>
              <T w="semibold" style={{ fontSize: 13 }}>QR from</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[['gcash', 'GCash'], ['maya', 'Maya'], ['bank', 'Bank']].map(([k, l]) => <Chip key={k} label={l} on={wallet === k} onPress={() => setWallet(k)} />)}
              </View>
              <T w="semibold" style={{ fontSize: 13 }}>Account name on the QR (must match your ID: {h?.full_name})</T>
              <TextInput value={acct} onChangeText={setAcct} placeholder="Account name" placeholderTextColor="#98A2B3" accessibilityLabel="Account name" style={st.input} />
              <PressScale onPress={pickQr} style={st.pick}>
                {qrUri ? <Image source={{ uri: qrUri }} style={{ width: 120, height: 120, borderRadius: 10 }} /> : <T w="bold" style={{ fontSize: 14 }}>Choose QR image from gallery</T>}
              </PressScale>
              <ErrorText>{err}</ErrorText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {!!tp?.payment_qr_path && <PressScale outer={{ flex: 1 }} onPress={() => { setQrEdit(false); setQrUri(null); }} style={st.ghost}><T w="bold" style={{ fontSize: 14 }}>Cancel</T></PressScale>}
                <View style={{ flex: 1.6 }}><GlossyButton label="Save payment QR" onPress={async () => { await saveQr(); setQrEdit(false); }} loading={busy} disabled={!qrUri} /></View>
              </View>
            </>
          )}
        </Rise>

        {/* ---------- Availability ---------- */}
        <Rise i={3} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 18 }}>Availability</T>
            <T w="semibold" style={{ fontSize: 13, color: colors.body }}>{days.length} {days.length === 1 ? 'day' : 'days'} · {h12(from)}–{h12(to)}</T>
          </View>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Clients can only schedule you on these days and hours.</T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => {
              const on = days.includes(i + 1);
              return (
                <PressScale key={d} outer={{ flex: 1 }} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  onPress={() => { setAvailDirty(true); setDays((c) => (c.includes(i + 1) ? c.filter((x) => x !== i + 1) : [...c, i + 1].sort())); }}
                  style={[st.dayBtn, on && { backgroundColor: '#0B5566', borderColor: '#0B5566' }]}>
                  <T w="extrabold" style={{ fontSize: 13, color: on ? '#FFF' : '#98A2B3' }}>{d}</T>
                </PressScale>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([['From', from, setFrom, FROM_H], ['To', to, setTo, TO_H]] as [string, string, (v: string) => void, string[]][]).map(([l, v, set, opts]) => (
              <View key={l} style={{ flex: 1, gap: 4 }}>
                <T w="extrabold" style={{ fontSize: 13 }}>{l}</T>
                <PressScale onPress={() => { const i = opts.indexOf(v); set(opts[(i + 1) % opts.length]); setAvailDirty(true); }} style={[st.input, st.rowB]} accessibilityLabel={`${l} time, ${h12(v)}. Tap to change.`}>
                  <T style={{ fontSize: 15 }}>{h12(v)}</T><Ic d={P.chevDown} size={16} />
                </PressScale>
              </View>
            ))}
          </View>
          <T style={{ fontSize: 12, color: colors.muted }}>Tap a time to change it. Going Offline in the header pauses all new requests anytime.</T>
          {availDirty && <GlossyButton label="Save availability" onPress={saveAvail} disabled={!days.length} />}
        </Rise>

        {/* ---------- Portfolio ---------- */}
        <Rise i={3} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 18 }}>Portfolio · {office.length} {office.length === 1 ? 'photo' : 'photos'}</T>
            <T w="semibold" style={{ fontSize: 12, color: colors.body }}>Shown on your profile</T>
          </View>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Photos of your finished work. Camera only, so every photo is real and stamped by TSKR.</T>
          <View style={st.grid}>
            {office.length < 12 && (
              <PressScale outer={{ width: '31.5%' }} onPress={addPortfolio} accessibilityLabel="Take a work photo" style={[st.thumb, st.addThumb]}>
                <Ic d={P.camera} size={20} /><T w="extrabold" style={{ fontSize: 12 }}>{portBusy ? 'Saving…' : 'Take photo'}</T>
              </PressScale>
            )}
            {office.map((o) => (
              <PressScale key={o.id} outer={{ width: '31.5%' }} onPress={() => removePortfolio(o.id)} accessibilityLabel="Remove photo" style={st.thumb}>
                {o.url ? <Image source={{ uri: o.url }} style={StyleSheet.absoluteFill} /> : null}
                <View style={st.stamp}><T w="extrabold" style={{ fontSize: 9, color: '#FFF' }}>TSKR · {new Date(o.taken).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</T></View>
              </PressScale>
            ))}
          </View>
          {office.length > 0 && <T style={{ fontSize: 12, color: colors.muted }}>Tap a photo to remove it.</T>}
        </Rise>

        {/* ---------- Job history ---------- */}
        <T w="extrabold" style={{ fontSize: 18, marginTop: 4 }}>Job history</T>
        <Rise i={4} style={[glassCard, { overflow: 'hidden' }]}>
          {jobs.length === 0 && <T style={{ padding: 16, fontSize: 14, color: colors.muted }}>Finished and cancelled jobs show here.</T>}
          {jobs.map((j, i) => {
            const ok = j.status === 'completed';
            const when = new Date(j.completed_at ?? j.cancelled_at ?? j.created_at);
            const today = when.toDateString() === new Date().toDateString();
            const line = ok ? `Completed${j.payment_method === 'qr' ? ' · paid to QR' : j.payment_method === 'cash' ? ' · cash' : ''}`
              : j.status === 'declined_by_tasker' ? 'You declined' : `Cancelled by ${j.cancelled_by && j.cancelled_by === j.client_id ? 'client' : j.cancelled_by ? 'you' : 'TSKR'}${!j.fee_coins ? ' · no coins deducted' : ''}`;
            return (
              <PressScale key={j.id} onPress={() => router.push({ pathname: '/work/job/[id]', params: { id: j.id } })}
                style={[{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T w="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{j.service}</T>
                  <T style={{ fontSize: 13, color: colors.body }}>{j.client} · {today ? 'Today' : when.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</T>
                  <T w="bold" style={{ fontSize: 13, color: ok ? '#2E7D32' : colors.error }}>{line}</T>
                </View>
                <T w="extrabold" style={{ fontSize: 16 }}>{ok ? peso(j.total) : '—'}</T>
              </PressScale>
            );
          })}
        </Rise>

        {/* ---------- Reliability ---------- */}
        {top && (
          <Rise i={4} style={[glassCard, { padding: 16, gap: 10 }]}>
            <View style={st.rowB}>
              <T w="extrabold" style={{ fontSize: 18 }}>Reliability</T>
              <View style={[st.tag, { backgroundColor: top.strikes_30d ? colors.warnBg : '#E9F8E6' }]}><T w="extrabold" style={{ fontSize: 11, color: top.strikes_30d ? colors.warnText : '#2E7D32' }}>{top.strikes_30d} of 3 strikes</T></View>
            </View>
            <T style={{ fontSize: 14, color: colors.body, lineHeight: 20 }}>{top.strikes_30d ? `${top.strikes_30d} ${top.strikes_30d > 1 ? 'strikes' : 'strike'} in the last 30 days. 3 strikes pauses new requests for 7 days.` : 'No cancellations or no-shows in the last 30 days. Keep it up!'}</T>
            <View style={st.track}><View style={[st.trackFill, { width: `${Math.max(0, 100 - (top.strikes_30d / 3) * 100)}%`, backgroundColor: top.strikes_30d >= 2 ? colors.error : top.strikes_30d ? '#F2A33A' : colors.green }]} /></View>
            <View style={st.table}>
              {[['1st strike', 'Warning + 100 coins'], ['2nd strike', '200 coins + lower ranking for 7 days'], ['3rd strike', 'Paused for 7 days'], ['5 in 90 days', 'Account review, may be removed'], ['No-show', 'Counts as 2 strikes']].map(([a2, b2], i) => (
                <View key={a2} style={[{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
                  <T w="extrabold" style={{ fontSize: 13, width: 92 }}>{a2}</T>
                  <T style={{ fontSize: 13, color: colors.body, flex: 1 }}>{b2}</T>
                </View>
              ))}
            </View>
            <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Strikes count for unjustified cancellations after the client accepts your offer. A no-show (not arriving and not cancelling) counts as 2 strikes.</T>
          </Rise>
        )}

        <Rise i={4} style={[glassCard, { padding: 16, gap: 10 }]}>
          <T w="extrabold" style={{ fontSize: 17 }}>Emergency contact</T>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>If you press SOS during a job, our safety team may call this person.</T>
          <TextInput value={emName} onChangeText={setEmName} placeholder="Name, e.g. Maria Cruz (wife)" placeholderTextColor="#98A2B3" accessibilityLabel="Emergency contact name" style={st.input} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={st.prefix}><T w="bold" style={{ fontSize: 15 }}>+63</T></View>
            <TextInput value={emPhone} onChangeText={setEmPhone} keyboardType="phone-pad" placeholder="917 123 4567" placeholderTextColor="#98A2B3" accessibilityLabel="Emergency contact mobile" style={[st.input, { flex: 1 }]} />
          </View>
          <ErrorText>{emErr}</ErrorText>
          {!!emSaved && <T w="semibold" style={{ fontSize: 13, color: '#2E7D32' }}>{emSaved}</T>}
          <PressScale onPress={saveEmergency} style={st.ghost}><T w="bold" style={{ fontSize: 14 }}>Save emergency contact</T></PressScale>
        </Rise>

        <View style={[glassCard, { overflow: 'hidden' }]}>
          <PressScale onPress={() => closeAccount('deactivated')} style={{ padding: 16 }}><T w="extrabold" style={{ fontSize: 16 }}>Deactivate account</T></PressScale>
          <View style={{ height: 1, backgroundColor: 'rgba(4,77,94,0.08)' }} />
          <PressScale onPress={() => closeAccount('deleted')} style={{ padding: 16 }}><T w="extrabold" style={{ fontSize: 16, color: colors.error }}>Delete account</T></PressScale>
          <View style={{ height: 1, backgroundColor: 'rgba(4,77,94,0.08)' }} />
          <PressScale onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }} style={{ padding: 16 }}><T w="bold" style={{ fontSize: 15, color: colors.muted }}>Sign out</T></PressScale>
        </View>
      </ScrollView>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const FROM_H = ['06:00', '07:00', '08:00', '09:00', '10:00'];
const TO_H = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const h12 = (h: string) => { const n = Number(h.slice(0, 2)); return `${n % 12 || 12}:${h.slice(3)} ${n < 12 ? 'AM' : 'PM'}`; };

const st = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  badge: { backgroundColor: colors.green, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  onPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 14, height: 34 },
  onDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal },
  headAvatar: { width: 46, height: 46, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#FFF', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  coinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 12, height: 40 },
  modeCard: { padding: 14, gap: 4, borderRadius: 20, minHeight: 170 },
  modeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  modePill: { alignSelf: 'flex-start', marginTop: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FFF' },
  banner: { height: 92, flexDirection: 'row' },
  bannerTile: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  officeTag: { position: 'absolute', top: 10, left: 12, backgroundColor: colors.green, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  officePhoto: { width: 92, height: 92, borderRadius: 22, marginTop: -40, borderWidth: 4, borderColor: '#FFF', overflow: 'hidden', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  verified: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#2E9E4F', alignItems: 'center', justifyContent: 'center' },
  earnCard: { borderRadius: 24, padding: 18, backgroundColor: '#3E6B78', gap: 2 },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, padding: 3 },
  segBtn: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 },
  qrBox: { width: 124, height: 124, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  smallBtn: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.borderSoft },
  dayBtn: { height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  trackFill: { height: 8, borderRadius: 4 },
  table: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(4,77,94,0.1)', backgroundColor: 'rgba(255,255,255,0.6)' },
  rowB: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mode: { padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: '#FFF', gap: 2 },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  tag: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  input: { height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: '#FFF' },
  edit: { height: 32, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  ghost: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { aspectRatio: 1, width: '100%', borderRadius: 14, backgroundColor: colors.tint, overflow: 'hidden' },
  addThumb: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, backgroundColor: '#FFF' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', left: 6, right: 6, bottom: 6, borderRadius: 6, backgroundColor: 'rgba(4,77,94,0.8)', paddingVertical: 2, paddingHorizontal: 6 },
  stat: { flex: 1, padding: 10, borderRadius: 14, backgroundColor: colors.tint, gap: 2 },
  prefix: { height: 50, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  pick: { minHeight: 56, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', padding: 10 },
});
