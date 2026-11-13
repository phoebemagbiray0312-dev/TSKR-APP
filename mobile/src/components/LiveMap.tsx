import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { bubble, colors } from '../theme';
import { T } from './text';
import { PressScale } from './glass';
import { Ic, P } from './clientUi';
import { supabase } from '../lib/supabase';

type Pt = { lat: number; lng: number };
const km = (a: Pt, b: Pt) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
// Metro Manila average: ~20 km/h door to door. Real ETAs come with a directions API key later.
const etaMin = (d: number) => Math.max(1, Math.round((d / 20) * 60));

/**
 * Live tracking map (design: tasker JOB "Client sees your live location", client TRACKING "LIVE · ETA").
 * mode 'tasker': shares this phone's location for the booking every ~15 s and offers Waze / Google Maps / Apple Maps.
 * mode 'client': follows the tasker's latest location in real time.
 */
export function LiveMap({ bookingId, mode, dest, destLabel, initials, active, height = 260, demoDrive }: {
  bookingId: string; mode: 'tasker' | 'client'; dest: Pt; destLabel: string; initials: string; active: boolean; height?: number;
  /** TEST BUILD: demo taskers move toward the client every few seconds */ demoDrive?: boolean;
}) {
  const map = useRef<MapView>(null);
  const [tasker, setTasker] = useState<Pt | null>(null);
  const [denied, setDenied] = useState(false);
  const lastSent = useRef(0);

  // tasker: watch GPS and share it with the client
  useEffect(() => {
    if (mode !== 'tasker' || !active) return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setDenied(true); return; }
      const { data } = await supabase.auth.getUser();
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 5000 }, async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTasker(p);
        if (Date.now() - lastSent.current > 15000 && data.user) {
          lastSent.current = Date.now();
          await supabase.from('location_pings').insert({ booking_id: bookingId, user_id: data.user.id, lat: p.lat, lng: p.lng });
        }
      });
    })();
    return () => { sub?.remove(); };
  }, [mode, active, bookingId]);

  // client: latest ping + live updates
  useEffect(() => {
    if (mode !== 'client') return;
    supabase.from('location_pings').select('lat,lng').eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]) setTasker({ lat: data[0].lat, lng: data[0].lng }); });
    const ch = supabase.channel(`pings-${bookingId}-${Date.now()}-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_pings', filter: `booking_id=eq.${bookingId}` },
        (p) => setTasker({ lat: (p.new as any).lat, lng: (p.new as any).lng }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [mode, bookingId]);

  useEffect(() => {
    if (!demoDrive) return;
    const tick = () => { supabase.rpc('demo_tasker_ping', { p_booking: bookingId }); };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [demoDrive, bookingId]);

  // keep both points in view
  useEffect(() => {
    const pts = [dest, ...(tasker ? [tasker] : [])].map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (pts.length > 1) map.current?.fitToCoordinates(pts, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
    else map.current?.animateToRegion({ latitude: dest.lat, longitude: dest.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
  }, [tasker?.lat, tasker?.lng, dest.lat, dest.lng]);

  const dist = useMemo(() => (tasker ? km(tasker, dest) : null), [tasker, dest]);
  const label = !active ? 'Done' : dist == null ? (mode === 'tasker' ? 'Finding your location…' : 'Waiting for your tasker’s location…')
    : dist < 0.08 ? 'Arrived' : `${dist.toFixed(1)} km · about ${etaMin(dist)} min`;

  const open = (app: 'waze' | 'google' | 'apple') => {
    const { lat, lng } = dest;
    const url = app === 'waze' ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
      : app === 'google' ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      : `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={[st.map, { height }]}>
        <MapView ref={map} style={StyleSheet.absoluteFill} showsUserLocation={mode === 'tasker'} showsPointsOfInterest={false}
          initialRegion={{ latitude: dest.lat, longitude: dest.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}>
          <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} title={destLabel} anchor={{ x: 0.5, y: 1 }}>
            <View style={st.destPin}><Ic d={P.navHome} size={16} color="#FFF" w={2.2} /></View>
          </Marker>
          {tasker && mode === 'client' && (
            <Marker coordinate={{ latitude: tasker.lat, longitude: tasker.lng }} title="Your tasker" anchor={{ x: 0.5, y: 0.5 }}>
              <View style={st.taskerPin}><T w="extrabold" style={{ color: '#FFF', fontSize: 11 }}>{initials}</T></View>
            </Marker>
          )}
          {tasker && active && (
            <Polyline coordinates={[{ latitude: tasker.lat, longitude: tasker.lng }, { latitude: dest.lat, longitude: dest.lng }]}
              strokeColor={colors.teal} strokeWidth={4} lineDashPattern={[8, 6]} />
          )}
        </MapView>
        <View style={st.live}>
          {active && <View style={st.liveDot} />}
          <T w="bold" style={{ fontSize: 12 }}>{active ? 'LIVE · ' : ''}{label}</T>
        </View>
        {mode === 'tasker' && active && !denied && <View style={st.share}><T w="semibold" style={{ fontSize: 11, color: colors.body }}>Client sees your live location</T></View>}
      </View>
      {denied && <T style={{ fontSize: 12, color: colors.error }}>Allow location in Settings so the client can see you coming.</T>}
      {mode === 'tasker' && active && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['waze', 'Waze'], ['google', 'Google Maps'], ['apple', 'Apple Maps']] as const).map(([k, l]) => (
            <PressScale key={k} outer={{ flex: 1 }} onPress={() => open(k)} style={st.navBtn}>
              <Ic d="M3 11 21 3l-8 18-2-8z" size={14} w={2.2} />
              <T w="bold" style={{ fontSize: 12 }}>{l}</T>
            </PressScale>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  map: { ...bubble(22, 6), overflow: 'hidden', backgroundColor: colors.tint },
  destPin: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.teal, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  taskerPin: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2E9B3E', borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  live: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E7D32' },
  share: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  navBtn: { height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.teal, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
