import React, { forwardRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import RNMapView, { Circle, Marker, Polyline, Region } from 'react-native-maps';
import { colors } from '../theme';
import { T } from './text';

/**
 * Android test builds need a Google Maps key (comes with the company Google Cloud account).
 * Until then, maps show a placeholder on Android builds so the app doesn't crash.
 * iOS (Apple Maps) and Expo Go always show the real map.
 */
export const MAPS_OK =
  Platform.OS !== 'android' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  !!(Constants.expoConfig as any)?.android?.config?.googleMaps?.apiKey;

const MapView = forwardRef<RNMapView, React.ComponentProps<typeof RNMapView>>((props, ref) => {
  if (MAPS_OK) return <RNMapView ref={ref} {...props} />;
  return (
    <View style={[props.style, st.fallback]}>
      <T w="bold" style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Map coming soon on Android test builds</T>
    </View>
  );
});
MapView.displayName = 'MapView';

export default MapView;
export { Circle, Marker, Polyline };
export type { Region };

const st = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint, padding: 16 },
});
