import React, { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, font } from '../../../src/theme';
import { ErrorText, T } from '../../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../../src/components/glass';
import { Chip, Ic, P, Toast, glassCard } from '../../../src/components/clientUi';
import { peso, useClient } from '../../../src/lib/client';
import { TaskerHome, loadTaskerHome, uploadImage } from '../../../src/lib/tasker';
import { rpc, supabase } from '../../../src/lib/supabase';

type TP = { nickname: string | null; bio: string | null; photo_path: string | null; qr_wallet_type: string | null; qr_account_name: string | null; qr_status: string; payment_qr_path: string | null };

/** Design: tasker ME — switch mode, my office, payment QR, account. */
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
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [office, setOffice] = useState<{ id: string; path: string; taken: string; url: string | null }[]>([]);
  const [top, setTop] = useState<any>(null);
  const [portBusy, setPortBusy] = useState(false);
  const [offErr, setOffErr] = useState('');
  const [offBusy, setOffBusy] = useState(false);
  // earnings
  const [earn, setEarn] = useState<{ week: number; month: number; all: number; jobs: number } | null>(null);
  // emergency contact
  const [emName, setEmName] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [emSaved, setEmSaved] = useState('');
  const [emErr, setEmErr] = useState('');

  const load = useCallback(async () => {
    const home = await loadTaskerHome(); setH(home);
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from('tasker_profiles').select('nickname,bio,photo_path,qr_wallet_type,qr_account_name,qr_status,payment_qr_path').eq('user_id', u.user!.id).maybeSingle();
    const t = data as TP | null; setTp(t);
    setAcct((a) => a || t?.qr_account_name || home.full_name);
    if (t?.qr_wallet_type) setWallet(t.qr_wallet_type);
    if (t?.photo_path) { const s = await supabase.storage.from('tasker-media').createSignedUrl(t.photo_path, 3600); setPhotoUrl(s.data?.signedUrl ?? null); }
    const uid = u.user!.id;
    const [pf, bk, pr] = await Promise.all([
      supabase.from('portfolio_photos').select('id,photo_path,taken_at').eq('tasker_id', uid).order('taken_at', { ascending: false }).limit(12),
      supabase.from('bookings').select('final_price,initial_offer,completed_at').eq('tasker_id', uid).eq('status', 'completed'),
      supabase.from('profiles').select('emergency_contact_name,emergency_contact_phone').eq('id', uid).maybeSingle(),
    ]);
    const rows = (pf.data ?? []) as any[];
    const signed = rows.length ? (await supabase.storage.from('tasker-media').createSignedUrls(rows.map((r) => r.photo_path), 3600)).data ?? [] : [];
    setOffice(rows.map((r, i) => ({ id: r.id, path: r.photo_path, taken: r.taken_at, url: signed[i]?.signedUrl ?? null })));
    rpc('tasker_top_status', { p_tasker: uid }).then(setTop).catch(() => {});
    const now = new Date(); const weekAgo = new Date(now.getTime() - 7 * 864e5); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = { week: 0, month: 0, all: 0, jobs: 0 };
    for (const r of (bk.data ?? []) as any[]) {
      const amt = Number(r.final_price ?? r.initial_offer ?? 0); const at = r.completed_at ? new Date(r.completed_at) : now;
      e.all += amt; e.jobs += 1; if (at >= weekAgo) e.week += amt; if (at >= monthStart) e.month += amt;
    }
    setEarn(e);
    setEmName((v) => v || pr.data?.emergency_contact_name || ''); setEmPhone((v) => v || pr.data?.emergency_contact_phone || '');
  }, []);

  const startEdit = () => { setNick(tp?.nickname ?? ''); setAbout(tp?.bio ?? ''); setNewPhoto(null); setOffErr(''); setEditing(true); };
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
    setOffBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser(); const uid = u.user!.id;
      const photo = newPhoto ? await uploadImage('tasker-media', uid, newPhoto, 'profile') : tp?.photo_path;
      if (!photo) throw new Error('Add a profile photo to continue.');
      await rpc('save_tasker_office', { p_nickname: nick.trim(), p_about: about.trim(), p_photo_path: photo, p_office_paths: [] });
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

  const qrTag = tp?.qr_status === 'approved' ? 'APPROVED' : tp?.qr_status === 'pending' ? 'UNDER REVIEW' : tp?.qr_status === 'rejected' ? 'REJECTED' : 'MISSING';

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 130, gap: 14 }}>
        <T w="extrabold" style={{ fontSize: 26 }}>Me</T>

        <Rise i={0} style={[glassCard, { padding: 16, gap: 10 }]}>
          <T w="semibold" style={{ fontSize: 13, color: colors.muted }}>How do you want to use TSKR now?</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PressScale outer={{ flex: 1 }} onPress={() => router.replace('/home')} style={st.mode}>
              <T w="extrabold" style={{ fontSize: 15 }}>Client</T><T style={{ fontSize: 12, color: colors.muted }}>Book services</T><T w="bold" style={{ fontSize: 12 }}>Switch →</T>
            </PressScale>
            <View style={[st.mode, { flex: 1, borderColor: colors.teal, borderWidth: 2, backgroundColor: colors.tint }]}>
              <T w="extrabold" style={{ fontSize: 15 }}>Tasker</T><T style={{ fontSize: 12, color: colors.muted }}>Get job requests</T><T w="bold" style={{ fontSize: 12, color: '#2E7D32' }}>✓ You’re here</T>
            </View>
          </View>
          <T style={{ fontSize: 12, color: colors.muted }}>Switch anytime. You can’t book your own tasker profile.</T>
        </Rise>

        <Rise i={1} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 17 }}>My office</T>
            {!editing && <PressScale onPress={startEdit} style={st.edit}><T w="bold" style={{ fontSize: 13 }}>Edit</T></PressScale>}
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <PressScale disabled={!editing} onPress={takeSelfie} accessibilityLabel="Retake profile photo" style={st.avatar}>
              {newPhoto || photoUrl ? <Image source={{ uri: newPhoto ?? photoUrl! }} style={StyleSheet.absoluteFill} /> : <Ic d={P.navUser} size={28} color={colors.muted} />}
            </PressScale>
            <View style={{ flex: 1 }}>
              {editing ? <T w="bold" style={{ fontSize: 13 }} onPress={takeSelfie}>{newPhoto ? '✓ New photo · retake' : 'Retake photo (camera)'}</T> : <T w="extrabold" style={{ fontSize: 16 }}>{tp?.nickname ?? h?.short_name}</T>}
              <T style={{ fontSize: 13, color: colors.muted }}>{h?.full_name} · {h?.area_label ?? 'No service area yet'}</T>
            </View>
          </View>
          {editing ? (
            <>
              <T w="semibold" style={{ fontSize: 13 }}>Nickname</T>
              <TextInput value={nick} onChangeText={setNick} maxLength={20} placeholder="e.g. Kuya Jun" placeholderTextColor="#98A2B3" accessibilityLabel="Nickname" style={st.input} />
              <T w="semibold" style={{ fontSize: 13 }}>About · {about.length}/300</T>
              <TextInput value={about} onChangeText={setAbout} maxLength={300} multiline placeholder="Your experience, tools, what you’re good at" placeholderTextColor="#98A2B3"
                accessibilityLabel="About" style={[st.input, { height: 110, paddingTop: 12, textAlignVertical: 'top' }]} />
              <T style={{ fontSize: 12, color: colors.muted }}>No phone numbers, links or social media.</T>
            </>
          ) : !!tp?.bio && <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>{tp.bio}</T>}
          {editing && (
            <>
              <ErrorText>{offErr}</ErrorText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PressScale outer={{ flex: 1 }} onPress={() => setEditing(false)} style={st.ghost}><T w="bold" style={{ fontSize: 14 }}>Cancel</T></PressScale>
                <View style={{ flex: 1.6 }}><GlossyButton label="Save my office" loading={offBusy} onPress={saveOffice} /></View>
              </View>
            </>
          )}
        </Rise>

        {earn && (
          <Rise i={2} style={[glassCard, { padding: 16, gap: 10 }]}>
            <T w="extrabold" style={{ fontSize: 17 }}>Earnings</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([['Last 7 days', earn.week], ['This month', earn.month], ['All time', earn.all]] as [string, number][]).map(([l, v]) => (
                <View key={l} style={st.stat}><T w="extrabold" style={{ fontSize: 17 }}>{peso(v)}</T><T style={{ fontSize: 11, color: colors.muted }}>{l}</T></View>
              ))}
            </View>
            <T style={{ fontSize: 12, color: colors.muted }}>{earn.jobs} completed {earn.jobs === 1 ? 'job' : 'jobs'}. Clients pay you directly, so this is what they agreed to pay, not money held by TSKR.</T>
          </Rise>
        )}

        {top && (
          <Rise i={2} style={[glassCard, { padding: 16, gap: 10 }, top.is_top && { borderColor: colors.green, borderWidth: 1.5 }]}>
            <View style={st.rowB}>
              <T w="extrabold" style={{ fontSize: 17 }}>Top Tasker</T>
              <View style={[st.tag, { backgroundColor: top.is_top ? '#E9F8E6' : colors.warnBg }]}><T w="extrabold" style={{ fontSize: 10 }}>{top.is_top ? '★ YOU’RE A TOP TASKER' : 'ALMOST THERE'}</T></View>
            </View>
            <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Top Taskers get a badge on their profile. Only bookings made in TSKR count.</T>
            {([
              [`Rating ${top.min_rating} or higher`, top.rating > 0 ? String(top.rating) : 'No ratings yet', top.rating >= top.min_rating],
              [`${top.min_jobs_30d}+ jobs in the last 30 days`, `${top.jobs_30d} of ${top.min_jobs_30d}`, top.jobs_30d >= top.min_jobs_30d],
              [`${top.min_completion_pct}%+ jobs completed`, `${top.completion_pct}%`, top.completion_pct >= top.min_completion_pct],
              ['No strikes in 90 days', String(top.strikes_90d), top.strikes_90d === 0],
            ] as [string, string, boolean][]).map(([l, v, ok]) => (
              <View key={l} style={[st.rowB, { gap: 10 }]}>
                <View style={[st.dot, ok && { backgroundColor: colors.green, borderColor: colors.green }]}>{ok && <Ic d={P.check} size={12} color={colors.teal} w={3} />}</View>
                <T w="semibold" style={{ fontSize: 14, flex: 1 }}>{l}</T>
                <T w="extrabold" style={{ fontSize: 14, color: ok ? colors.teal : colors.muted }}>{v}</T>
              </View>
            ))}
          </Rise>
        )}

        <Rise i={2} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 17 }}>Portfolio · {office.length}</T>
            <T style={{ fontSize: 12, color: colors.muted }}>Shown on your profile</T>
          </View>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Photos of your finished work. Camera only, so every photo is real and stamped by TSKR.</T>
          <View style={st.grid}>
            {office.map((o) => (
              <PressScale key={o.id} onPress={() => removePortfolio(o.id)} accessibilityLabel="Remove photo" style={st.thumb}>
                {o.url ? <Image source={{ uri: o.url }} style={StyleSheet.absoluteFill} /> : null}
                <View style={st.stamp}><T w="bold" style={{ fontSize: 8, color: '#FFF' }}>TSKR · {new Date(o.taken).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</T></View>
              </PressScale>
            ))}
            {office.length < 12 && (
              <PressScale onPress={addPortfolio} accessibilityLabel="Take a work photo" style={[st.thumb, st.addThumb]}>
                <T w="extrabold" style={{ fontSize: 22 }}>{portBusy ? '…' : '+'}</T><T w="bold" style={{ fontSize: 10 }}>Take photo</T>
              </PressScale>
            )}
          </View>
          {office.length > 0 && <T style={{ fontSize: 12, color: colors.muted }}>Tap a photo to remove it.</T>}
        </Rise>

        {top && (
          <Rise i={2} style={[glassCard, { padding: 16, gap: 8 }]}>
            <View style={st.rowB}>
              <T w="extrabold" style={{ fontSize: 17 }}>Reliability</T>
              <View style={[st.tag, { backgroundColor: top.strikes_30d ? colors.warnBg : '#E9F8E6' }]}><T w="extrabold" style={{ fontSize: 10 }}>{top.strikes_30d ? `${top.strikes_30d} STRIKE${top.strikes_30d > 1 ? 'S' : ''}` : 'NO STRIKES'}</T></View>
            </View>
            <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>{top.strikes_30d ? `${top.strikes_30d} strike${top.strikes_30d > 1 ? 's' : ''} in the last 30 days. 3 strikes pauses new requests for 7 days.` : 'No cancellations or no-shows in the last 30 days. Keep it up!'}</T>
            <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Strikes count for unjustified cancellations after the client accepts your offer. A no-show (not arriving and not cancelling) counts as 2 strikes.</T>
          </Rise>
        )}

        <Rise i={3} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 17 }}>Payment QR</T>
            <View style={[st.tag, { backgroundColor: tp?.qr_status === 'approved' ? '#E9F8E6' : colors.warnBg }]}><T w="extrabold" style={{ fontSize: 10 }}>{qrTag}</T></View>
          </View>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Clients see it only after they accept your offer. They use it to pay you and for the ₱100 late-cancellation fee. TSKR doesn’t hold this money.</T>
          <T w="semibold" style={{ fontSize: 13 }}>QR from</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['gcash', 'GCash'], ['maya', 'Maya'], ['bank', 'Bank']].map(([k, l]) => <Chip key={k} label={l} on={wallet === k} onPress={() => setWallet(k)} />)}
          </View>
          <T w="semibold" style={{ fontSize: 13 }}>Account name on the QR (must match your ID: {h?.full_name})</T>
          <TextInput value={acct} onChangeText={setAcct} placeholder="Account name" placeholderTextColor="#98A2B3" accessibilityLabel="Account name" style={st.input} />
          <PressScale onPress={pickQr} style={st.pick}>
            {qrUri ? <Image source={{ uri: qrUri }} style={{ width: 120, height: 120, borderRadius: 10 }} /> : <T w="bold" style={{ fontSize: 14 }}>{tp?.payment_qr_path ? 'Replace QR image (gallery)' : 'Choose QR image from gallery'}</T>}
          </PressScale>
          <ErrorText>{err}</ErrorText>
          <GlossyButton label="Save payment QR" onPress={saveQr} loading={busy} disabled={!qrUri} />
        </Rise>

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

        <PressScale onPress={pauseAccount} style={[glassCard, { padding: 16 }]}>
          <T w="bold" style={{ fontSize: 15 }}>Pause my tasker account</T>
          <T style={{ fontSize: 12, color: colors.muted }}>Go offline and hide your profile. To delete your account, go to Client › Account.</T>
        </PressScale>

        <PressScale onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }} style={[glassCard, { padding: 16 }]}>
          <T w="bold" style={{ fontSize: 15, color: colors.error }}>Sign out</T>
        </PressScale>
      </ScrollView>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const st = StyleSheet.create({
  rowB: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mode: { padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: '#FFF', gap: 2 },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  tag: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  input: { height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: '#FFF' },
  edit: { height: 32, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  ghost: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.tint, overflow: 'hidden' },
  addThumb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, backgroundColor: '#FFF' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,77,94,0.75)', paddingVertical: 2, alignItems: 'center' },
  stat: { flex: 1, padding: 10, borderRadius: 14, backgroundColor: colors.tint, gap: 2 },
  prefix: { height: 50, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  pick: { minHeight: 56, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', padding: 10 },
});
