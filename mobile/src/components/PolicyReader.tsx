import React, { useEffect, useRef, useState } from 'react';
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../theme';
import { CloseIcon } from './icons';
import { T } from './ui';
import type { PolicyDoc } from '../lib/signup';

/**
 * Read-to-agree sheet (Guide §2.3): Terms (Step 1 of 2) then Privacy (Step 2 of 2).
 * The agree button stays disabled until the user scrolls to the end of each document.
 */
export function PolicyReader({ visible, doc, step, onAgree, onClose }: {
  visible: boolean; doc: PolicyDoc | null; step: 1 | 2; onAgree: () => void; onClose: () => void;
}) {
  const [pct, setPct] = useState(0);
  const [end, setEnd] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { setPct(0); setEnd(false); scroller.current?.scrollTo({ y: 0, animated: false }); }, [doc?.id]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const seen = contentOffset.y + layoutMeasurement.height;
    setPct((p) => Math.max(p, Math.round((seen / contentSize.height) * 100)));
    if (seen >= contentSize.height - 12) setEnd(true);
  };
  // very short documents fit without scrolling
  const onSize = (_w: number, h: number) => { if (h > 0 && h < 500) setEnd(true); };

  if (!doc) return null;
  const effective = new Date(doc.effective_date).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const label = !end ? 'Scroll to the end to continue' : step === 2 ? 'I agree to the Privacy Policy' : 'I agree · Next: Privacy Policy';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
        <View accessibilityViewIsModal style={{ height: '92%', backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
          <View style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T w="extrabold" style={{ fontSize: 12, letterSpacing: 0.6, color: colors.muted }}>STEP {step} OF 2</T>
              <Pressable accessibilityLabel="Close" onPress={onClose}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                <CloseIcon />
              </Pressable>
            </View>
            <T w="extrabold" style={{ fontSize: 22 }}>{doc.title}</T>
            <T style={{ fontSize: 12, color: colors.muted }}>Version {doc.version} · Effective {effective}</T>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.tint, overflow: 'hidden' }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.green, width: `${end ? 100 : Math.max(4, pct)}%` }} />
            </View>
          </View>
          <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={64} onContentSizeChange={onSize}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 14 }}>
            {doc.sections.map((d) => (
              <View key={d.h} style={{ gap: 4 }}>
                <T w="extrabold" style={{ fontSize: 15 }}>{d.h}</T>
                <T style={{ fontSize: 13, lineHeight: 20.8, color: colors.body }}>{d.p}</T>
              </View>
            ))}
            <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 }}>
              <T style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>End of {doc.title}</T>
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22 + insets.bottom, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !end }} onPress={end ? onAgree : undefined}
              style={{ height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: end ? colors.teal : colors.disabledBg, ...bubble(16, 4) }}>
              <T w="extrabold" style={{ fontSize: 15, color: end ? colors.white : colors.disabledText }}>{label}</T>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
