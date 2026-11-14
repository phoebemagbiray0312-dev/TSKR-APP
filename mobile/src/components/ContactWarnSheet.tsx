import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme';
import { T } from './ui';
import { GlossyButton } from './glass';
import { Sheet } from './clientUi';
import { rpc } from '../lib/supabase';

export type ChatBlock = { kind: 'warning' } | { kind: 'suspended'; until: string } | null;

/** Sends a chat message. Returns a block when the server stopped it (contact number or other app). */
export async function sendChat(booking: string, body: string): Promise<ChatBlock> {
  const r = await rpc<{ id?: string; blocked?: 'warning' | 'suspended'; until?: string }>('send_chat', { p_booking: booking, p_body: body });
  if (r?.blocked === 'warning') return { kind: 'warning' };
  if (r?.blocked === 'suspended') return { kind: 'suspended', until: r.until ?? '' };
  return null;
}

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; }
};

/** Design (Nov 14): "Are you trying to share a contact number?" — one warning, then a 1-week suspension. */
export function ContactWarnSheet({ block, onClose }: { block: ChatBlock; onClose: () => void }) {
  const suspended = block?.kind === 'suspended';
  return (
    <Sheet open={!!block} onClose={onClose} title={suspended ? 'Your account is suspended' : 'Are you trying to share a contact number?'}>
      <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>
        Your message wasn’t sent. Giving out anyone’s contact number, yours or someone else’s, is strictly prohibited on TSKR, even if it’s spelled out or split into parts.
      </T>
      <View style={{ borderRadius: 14, padding: 12, backgroundColor: suspended ? '#FDECEC' : colors.warnBg }}>
        <T w="bold" style={{ fontSize: 13, lineHeight: 19, color: suspended ? colors.error : colors.warnText }}>
          {suspended
            ? `You tried again after a warning, so your account is suspended until ${fmt((block as any).until)}. You can’t chat or take bookings until then.`
            : 'This is your warning. If you try again, your account may be suspended for 1 week.'}
        </T>
      </View>
      <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Need to talk? Use the in-app call button. It’s free and keeps both of you protected.</T>
      <GlossyButton label="I understand" onPress={onClose} />
    </Sheet>
  );
}
