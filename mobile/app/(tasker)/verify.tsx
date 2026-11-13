import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Circle, Path, Rect } from 'react-native-svg';
import { bubble, colors, font } from '../../src/theme';
import { ErrorText, T } from '../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../src/components/glass';
import { Ic, P, RoundButton } from '../../src/components/clientUi';
import { rpc, supabase } from '../../src/lib/supabase';

// design/become_tasker
const ID_TYPES = ['PhilSys National ID', 'Driver’s License', 'UMID', 'Passport', 'PRC ID', 'Postal ID', 'Voter’s ID'];
const REQS: [string, string, string][] = [
  ['Your profile', 'A live selfie taken in the app, a nickname and a short About in English.', 'M4 21V9l8-6 8 6v12zM9 21v-6h6v6'],
  ['2 valid government IDs', 'Two different IDs, e.g. National ID and Driver’s License.', 'M3 5h18v14H3zM7 9h4v5H7zM14 10h4M14 13h3'],
  ['Face check', 'A quick selfie to match you with your ID.', 'M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8M4 21a8 8 0 0 1 16 0'],
  ['Verified Google account and mobile', 'Same sign-in steps as clients.', 'M7 2h10v20H7zM11 18h2'],
];
const CONSENT: [string, string][] = [
  ['What we collect', 'Photos of 2 government IDs, the details read from them, a selfie and a face-match result.'],
  ['Why', 'To confirm you are a real person and that the IDs are yours, so clients can trust who comes to their home.'],
  ['Who sees it', 'Only TSKR’s verification team and our ID-check provider. Clients never see your IDs. We share data with authorities only when the law requires.'],
  ['How long we keep it', 'While your tasker account is active, and up to 5 years after it closes, as required by law.'],
  ['Your rights', 'You can access, correct or request deletion of your data, and withdraw consent, in Account › Legal and privacy.'],
];

type Step = 'loading' | 'intro' | 'design' | 'consent' | 'id1-type' | 'id1-scan' | 'id2-type' | 'id2-scan' | 'face' | 'done';
type App = {
  tasker_status: string; has_office: boolean; nickname: string | null; about: string | null; id_consent: boolean;
  latest: { status: string; id1: string; id2: string; submitted_at: string; note: string | null } | null;
  full_name: string; masked_name: string;
};
const STEP_NO: Partial<Record<Step, number>> = { design: 1, consent: 2, 'id1-type': 2, 'id1-scan': 2, 'id2-type': 2, 'id2-scan': 2, face: 3 };

async function upload(bucket: 'kyc' | 'tasker-media', uri: string, name: string) {
  const { data } = await supabase.auth.getUser();
  const path = `${data.user!.id}/${name}-${Date.now()}.jpg`;
  const buf = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

async function camera(front: boolean) {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Camera needed', 'Allow camera access in Settings to take your photos. Photos from the gallery aren’t accepted.');
    return null;
  }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'], quality: 0.7, allowsEditing: false,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  return r.canceled ? null : r.assets[0].uri;
}

export default function BecomeTasker() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('loading');
  const [app, setApp] = useState<App | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // office
  const [selfie, setSelfie] = useState<string | null>(null);
  const [nick, setNick] = useState('');
  const [about, setAbout] = useState('');
  const [pics, setPics] = useState<string[]>([]);
  // consent
  const [agree, setAgree] = useState(false);
  // IDs and face
  const [id1, setId1] = useState(''); const [id2, setId2] = useState('');
  const [shot1, setShot1] = useState<string | null>(null); const [shot2, setShot2] = useState<string | null>(null);
  const [face, setFace] = useState<string | null>(null);

  const refresh = async () => {
    const a = await rpc<App>('my_tasker_application');
    setApp(a);
    setNick(a.nickname ?? ''); setAbout(a.about ?? '');
    return a;
  };
  useEffect(() => {
    refresh().then((a) => {
      if (a.tasker_status === 'active') return router.replace('/work/home');
      if (a.tasker_status === 'pending') return setStep('done');
      setStep(a.has_office ? (a.id_consent ? 'id1-type' : 'consent') : 'intro');
    }).catch((e) => { setErr(e.message); setStep('intro'); });
  }, []);

  const go = (s: Step) => { setErr(''); setStep(s); };
  const back = () => {
    const order: Step[] = ['intro', 'design', 'consent', 'id1-type', 'id1-scan', 'id2-type', 'id2-scan', 'face'];
    const i = order.indexOf(step);
    if (i > 0) go(order[i - 1]);
  };
  const signOut = async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); };

  const saveOffice = async () => {
    setErr('');
    if (!selfie && !app?.has_office) { setErr('Add a profile photo to continue.'); return; }
    if (!nick.trim()) { setErr('Add a nickname.'); return; }
    if (/[^\x00-\x7F’‘“”–—ñÑ]/.test(about)) { setErr('Write your About in English.'); return; }
    setBusy(true);
    try {
      const photo = selfie ? await upload('tasker-media', selfie, 'profile') : null;
      const office: string[] = [];
      for (let i = 0; i < pics.length; i++) office.push(await upload('tasker-media', pics[i], `office-${i + 1}`));
      const { data: u } = await supabase.auth.getUser();
      const { data: tp } = await supabase.from('tasker_profiles').select('photo_path').eq('user_id', u.user!.id).maybeSingle();
      await rpc('save_tasker_office', { p_nickname: nick, p_about: about, p_photo_path: photo ?? tp?.photo_path, p_office_paths: office });
      await refresh();
      go(app?.id_consent ? 'id1-type' : 'consent');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const agreeConsent = async () => {
    if (!agree) { setErr('Please give your consent to continue. You can’t become a tasker without ID verification.'); return; }
    setBusy(true);
    try { await rpc('accept_policy', { p_doc_type: 'id_consent', p_role: 'tasker', p_app_version: '0.1.0' }); go('id1-type'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!shot1 || !shot2 || !face) return;
    setBusy(true); setErr('');
    try {
      const [p1, p2, pf] = [await upload('kyc', shot1, 'id1'), await upload('kyc', shot2, 'id2'), await upload('kyc', face, 'selfie')];
      // OCR and face match run at the ID-check provider (not connected yet), so they go to manual review.
      await rpc('submit_tasker_verification', {
        p_id1_type: id1, p_id1_path: p1, p_id1_ocr: { type: id1 }, p_id2_type: id2, p_id2_path: p2, p_id2_ocr: { type: id2 },
        p_selfie_path: pf, p_face_score: null,
      });
      await refresh();
      go('done');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (step === 'loading') return <View style={st.center}><Backdrop /><ActivityIndicator color={colors.teal} /></View>;
  const no = STEP_NO[step];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      {/* top bar */}
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {step !== 'intro' && step !== 'done' ? <RoundButton d={P.back} label="Back" size={40} onPress={back} /> : <View style={{ width: 4 }} />}
          <T w="extrabold" style={{ fontSize: 16, flex: 1 }}>Become a Tasker</T>
          {no ? <T w="semibold" style={{ fontSize: 13, color: colors.muted }}>Step {no} of 3</T> : null}
        </View>
        {no ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3].map((n) => <View key={n} style={[st.bar, n <= no && { backgroundColor: colors.green }]} />)}
          </View>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom, gap: 14 }}>
        {step === 'intro' && (
          <>
            <Rise i={0}><T w="extrabold" style={st.h1}>Earn with your skills.{'\n'}<T w="extrabold" style={[st.h1, { color: '#2E9B3E' }]}>Get verified first.</T></T></Rise>
            <Rise i={1}><T style={st.p}>To keep clients safe, every tasker is verified before they can receive bookings. Have these ready:</T></Rise>
            {REQS.map(([t, s, d], i) => (
              <Rise key={t} i={i + 2} style={[st.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
                <View style={st.reqIcon}><Ic d={d} size={22} w={1.8} /></View>
                <View style={{ flex: 1 }}><T w="bold" style={{ fontSize: 15 }}>{t}</T><T style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{s}</T></View>
              </Rise>
            ))}
            <View style={st.info}><T style={st.infoText}>First you’ll design your TSKR office: a live selfie for your profile photo, nickname, About and office photos. Your ID photos and face check are then taken with your phone camera inside the app.</T></View>
            <View style={st.info}><T style={st.infoText}><T w="bold" style={st.infoText}>Open to taskers all over the Philippines.</T> Bookings start in Metro Manila and nearby provinces (Bulacan, Pampanga, Rizal, Cavite, Laguna, and Lipa, Tanauan and Santo Tomas in Batangas).</T></View>
            <GlossyButton label="Get started" onPress={() => go('design')} />
            <PressScale onPress={signOut} style={{ alignSelf: 'center', padding: 10 }}><T w="bold" style={{ fontSize: 14 }}>Sign out</T></PressScale>
          </>
        )}

        {step === 'design' && (
          <>
            <T w="extrabold" style={st.kicker}>YOUR TSKR OFFICE</T>
            <T w="extrabold" style={st.h1}>Design your professional profile</T>
            <T style={st.p}>This is the office clients visit before they book you. A clear photo and a good About get more bookings.</T>

            <View style={[st.card, { gap: 10 }]}>
              <T w="bold" style={{ fontSize: 15 }}>Profile photo</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={st.selfie}>
                  {selfie ? <Image source={{ uri: selfie }} style={StyleSheet.absoluteFill} /> : <Ic size={34} color={colors.muted} w={1.6}><Circle cx={12} cy={8} r={4} /><Path d={P.navUser} /></Ic>}
                </View>
                <PressScale onPress={async () => { const u = await camera(true); if (u) setSelfie(u); }} style={st.outlineBtn}>
                  <T w="bold" style={{ fontSize: 14 }}>{selfie || app?.has_office ? 'Retake selfie' : 'Take a selfie'}</T>
                </PressScale>
              </View>
              <T style={st.small}>Your profile photo is a live selfie taken in the app with the front camera. Uploads from the gallery aren’t allowed, so clients see the real you. Face the light, no sunglasses, hat or mask. For your safety, clients only see your face after a booking is confirmed.</T>
            </View>

            <View style={[st.card, { gap: 8 }]}>
              <View style={st.rowBetween}><T w="bold" style={{ fontSize: 15 }}>Nickname</T><T style={st.small}>{nick.length}/20</T></View>
              <TextInput value={nick} onChangeText={(v) => setNick(v.slice(0, 20))} placeholder="e.g. Boss Mark" placeholderTextColor="#98A2B3" style={st.input} accessibilityLabel="Nickname" />
              <View style={[st.info, { marginTop: 4 }]}>
                <T style={st.infoText}><T w="bold" style={st.infoText}>Real name: {app?.full_name}</T>{'\n'}Taken from your ID. It can’t be changed, and your profile colors stay TSKR’s so every office looks trusted.</T>
              </View>
            </View>

            <View style={[st.card, { gap: 8 }]}>
              <View style={st.rowBetween}><T w="bold" style={{ fontSize: 15 }}>About you</T><T style={st.small}>{about.length}/300</T></View>
              <TextInput value={about} onChangeText={(v) => setAbout(v.slice(0, 300))} multiline accessibilityLabel="About you"
                placeholder="Write in English. Your experience, what you do best and how you work, e.g. 8 years fixing aircons. I bring my own tools and clean up after every job."
                placeholderTextColor="#98A2B3" style={[st.input, { height: 120, paddingTop: 12, textAlignVertical: 'top' }]} />
              <T style={st.small}>English only, so every client reads you as a professional. No phone numbers, links or social media.</T>
            </View>

            <View style={[st.card, { gap: 8 }]}>
              <View style={st.rowBetween}><T w="bold" style={{ fontSize: 15 }}>Office photos</T><T style={st.small}>{pics.length} of 12</T></View>
              <T style={st.small}>Up to 12 photos from your gallery: workspace, tools, service vehicle, before-and-after shots and finished jobs. Photos with phone numbers, QR codes or other apps’ logos are removed.</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {pics.length < 12 && (
                  <PressScale style={[st.picTile, st.addTile]} onPress={async () => {
                    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 12 - pics.length });
                    if (!r.canceled) setPics([...pics, ...r.assets.map((a) => a.uri)].slice(0, 12));
                  }}>
                    <Ic d={P.plus} w={2.2} /><T w="bold" style={{ fontSize: 11 }}>Add from gallery</T>
                  </PressScale>
                )}
                {pics.map((u, i) => (
                  <View key={u} style={st.picTile}>
                    <Image source={{ uri: u }} style={StyleSheet.absoluteFill} />
                    <PressScale accessibilityLabel="Remove photo" outer={{ position: 'absolute', top: 4, right: 4 }} style={st.remove}
                      onPress={() => setPics(pics.filter((_, j) => j !== i))}><Ic d="M6 6l12 12M18 6 6 18" size={14} color="#FFF" w={2.6} /></PressScale>
                  </View>
                ))}
              </View>
            </View>
            <ErrorText>{err}</ErrorText>
            <GlossyButton label="Continue" onPress={saveOffice} loading={busy} />
            <T style={[st.small, { textAlign: 'center' }]}>You can change your photo, nickname, About and office photos anytime in Me › My office.</T>
          </>
        )}

        {step === 'consent' && (
          <>
            <View style={st.bigIcon}><Ic d={P.shield} size={30} w={1.8} /></View>
            <T w="extrabold" style={st.h1}>Your consent for ID and face check</T>
            <T style={st.p}>Your government IDs and selfie are sensitive personal information. We need your permission before you scan them.</T>
            <View style={[st.card, { gap: 12 }]}>
              {CONSENT.map(([k, v]) => (
                <View key={k} style={{ gap: 2 }}><T w="bold" style={{ fontSize: 14 }}>{k}</T><T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>{v}</T></View>
              ))}
            </View>
            <PressScale accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => { setAgree(!agree); setErr(''); }}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={[st.box, agree && st.boxOn]}>{agree && <Ic d={P.check} size={14} color="#FFF" w={3} />}</View>
              <T style={{ fontSize: 14, color: colors.body, lineHeight: 20, flex: 1 }}>I agree that TSKR may collect and process my government IDs, selfie and face match to verify my identity, as described above.</T>
            </PressScale>
            <ErrorText>{err}</ErrorText>
            <GlossyButton label="Agree and continue" onPress={agreeConsent} loading={busy} />
            <T style={[st.small, { textAlign: 'center' }]}>Consent v1.0 · You can withdraw it anytime in Account › Legal and privacy. Withdrawing removes your tasker access.</T>
          </>
        )}

        {(step === 'id1-type' || step === 'id2-type') && (
          <>
            <T w="extrabold" style={st.h1}>{step === 'id2-type' ? 'Choose your second ID' : 'Choose your first ID'}</T>
            <T style={st.p}>{step === 'id2-type' ? `Pick a different ID from the first one (${id1}).` : 'Pick the government ID you’ll scan first.'}</T>
            {ID_TYPES.filter((t) => step !== 'id2-type' || t !== id1).map((t, i) => (
              <Rise key={t} i={i}>
                <PressScale onPress={() => { if (step === 'id1-type') { setId1(t); setShot1(null); go('id1-scan'); } else { setId2(t); setShot2(null); go('id2-scan'); } }}
                  style={[st.card, st.rowBetween, { paddingVertical: 16 }]}>
                  <T w="bold" style={{ fontSize: 15 }}>{t}</T><Ic d={P.chevRight} size={18} color={colors.muted} />
                </PressScale>
              </Rise>
            ))}
          </>
        )}

        {(step === 'id1-scan' || step === 'id2-scan') && (() => {
          const first = step === 'id1-scan';
          const shot = first ? shot1 : shot2;
          const type = first ? id1 : id2;
          const take = async () => { const u = await camera(false); if (u) (first ? setShot1 : setShot2)(u); };
          return (
            <>
              <T w="extrabold" style={st.h1}>{shot ? `ID ${first ? 1 : 2} captured` : `Scan the front of your ${type}`}</T>
              <T style={st.p}>Place it flat in good light. Make sure all text is clear and there’s no glare.</T>
              <View style={st.idFrame}>
                {shot ? <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
                  <Ic size={64} color="rgba(255,255,255,0.6)" w={1.2}><Rect x={3} y={5} width={18} height={14} rx={2} /><Path d="M7 9h4v5H7zM14 10h4M14 13h3" /></Ic>
                )}
              </View>
              {shot ? (
                <>
                  <View style={st.info}>
                    <T style={st.infoText}>Your ID details (name, birthday, ID number) are read by our ID-check partner and checked against your real name, <T w="bold" style={st.infoText}>{app?.full_name}</T>. In this test build, our team checks them by hand.</T>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <PressScale outer={{ flex: 1 }} style={[st.outlineBtn, { height: 52, alignItems: 'center' }]} onPress={take}><T w="bold" style={{ fontSize: 15 }}>Retake</T></PressScale>
                    <View style={{ flex: 1.4 }}><GlossyButton label="Continue" onPress={() => go(first ? 'id2-type' : 'face')} /></View>
                  </View>
                </>
              ) : (
                <>
                  <GlossyButton label="Open camera" onPress={take} />
                  <T style={[st.small, { textAlign: 'center' }]}>Camera only · ID photos from your gallery aren’t accepted</T>
                </>
              )}
            </>
          );
        })()}

        {step === 'face' && (
          <>
            <T w="extrabold" style={st.h1}>Take a selfie</T>
            <T style={st.p}>Keep your face inside the circle and look straight at the camera. No glasses, hats or masks.</T>
            <View style={[st.faceRing, face && { borderColor: colors.green }]}>
              {face ? <Image source={{ uri: face }} style={StyleSheet.absoluteFill} /> : <Ic size={90} color="rgba(255,255,255,0.5)" w={1.2}><Circle cx={12} cy={8} r={4} /><Path d={P.navUser} /></Ic>}
            </View>
            <View style={st.info}><T style={st.infoText}>We compare this selfie with your 2 IDs. In this test build, our team does the face check by hand.</T></View>
            <ErrorText>{err}</ErrorText>
            {face ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PressScale outer={{ flex: 1 }} style={[st.outlineBtn, { height: 52, alignItems: 'center' }]} onPress={async () => { const u = await camera(true); if (u) setFace(u); }}>
                  <T w="bold" style={{ fontSize: 15 }}>Retake</T>
                </PressScale>
                <View style={{ flex: 1.4 }}><GlossyButton label="Submit" onPress={submit} loading={busy} /></View>
              </View>
            ) : (
              <GlossyButton label="Open front camera" onPress={async () => { const u = await camera(true); if (u) setFace(u); }} />
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <View style={[st.bigIcon, { backgroundColor: '#E9F8E6' }]}><Ic d={P.check} size={32} color="#2E7D32" w={2.6} /></View>
            <T w="extrabold" style={st.h1}>{app?.latest?.status === 'rejected' ? 'Application not approved' : 'Application submitted'}</T>
            <T style={st.p}>Our team will review your documents, usually within 24–48 hours. We’ll notify you once you can start receiving bookings.</T>
            <View style={st.card}>
              {[['ID 1', `${app?.latest?.id1 ?? id1} ✓`], ['ID 2', `${app?.latest?.id2 ?? id2} ✓`], ['Face check', 'Selfie taken ✓'], ['Status', 'Under review']].map(([k, v], i) => (
                <View key={k} style={[st.rowBetween, { paddingVertical: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
                  <T w="semibold" style={{ fontSize: 14, color: colors.muted }}>{k}</T><T w="bold" style={{ fontSize: 14 }}>{v}</T>
                </View>
              ))}
            </View>
            <View style={st.info}>
              <T style={st.infoText}>Your TSKR name will always match your ID: <T w="bold" style={st.infoText}>{app?.full_name}</T>. Clients see it masked as <T w="bold" style={st.infoText}>{app?.masked_name}</T> until they accept your offer.</T>
            </View>
            <GlossyButton label="Book services while you wait" onPress={() => router.replace('/home')} />
            <PressScale onPress={signOut} style={{ alignSelf: 'center', padding: 10 }}><T w="bold" style={{ fontSize: 14 }}>Sign out</T></PressScale>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  h1: { fontSize: 26, lineHeight: 33 },
  kicker: { fontSize: 12, letterSpacing: 1, color: '#2E9B3E' },
  p: { fontSize: 15, color: colors.body, lineHeight: 23 },
  small: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { ...bubble(22, 6), padding: 16, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  reqIcon: { width: 44, height: 44, ...bubble(16, 4), backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  info: { borderRadius: 16, padding: 12, backgroundColor: 'rgba(230,241,243,0.85)' },
  infoText: { fontSize: 13, color: colors.body, lineHeight: 19 },
  selfie: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.tint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  outlineBtn: { borderWidth: 1.5, borderColor: colors.teal, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#FFF', justifyContent: 'center' },
  input: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: 'rgba(255,255,255,0.8)' },
  picTile: { width: 92, height: 92, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.tint },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.6)' },
  remove: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(4,30,38,0.7)', alignItems: 'center', justifyContent: 'center' },
  bigIcon: { width: 64, height: 64, ...bubble(22, 6), backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  idFrame: { height: 210, borderRadius: 20, backgroundColor: '#1E3A44', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(110,218,96,0.7)' },
  faceRing: { alignSelf: 'center', width: 230, height: 230, borderRadius: 115, backgroundColor: '#1E3A44', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(110,218,96,0.6)' },
});
