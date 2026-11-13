import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { rpc, supabase } from './supabase';
import { SavedAddress, addrName } from './places';

// ---------- data shapes returned by discover_taskers / get_tasker ----------
export type Service = { id: string; name: string; desc: string | null; price: number; dur: number | null; delivery?: boolean };
export type TaskerCard = {
  id: string; name: string; initials: string; title: string; years: number | null; area: string; color: string; photo: string | null;
  rating: number; reviews: number; jobs: number; km: number; eta_min: number; available_now: boolean; pro: boolean;
  favorite: boolean; cats: string[]; min_price: number; services: Service[];
};
export type Review = { name: string; initials: string; rating: number; text: string | null; tags: string[]; at: string };
export type TaskerFull = Omit<TaskerCard, 'reviews' | 'cats' | 'min_price' | 'pro' | 'available_now'> & {
  bio: string | null; reviews_count: number; online: boolean; radius_km: number; area_lat: number | null; area_lng: number | null; portfolio: string[]; reviews: Review[];
};

// ---------- formatting ----------
export const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');
export const durText = (m: number | null) => {
  if (!m) return '';
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hr' : 'hrs'}`;
};
export const etaText = (m: number) => (m < 60 ? `${m} min` : durText(Math.round(m / 15) * 15));
export const firstName = (masked: string) => masked.split(' ')[0];

// Design categories (Home tiles) mapped to the database category names.
export const CATS: { id: string; label: string; db: string }[] = [
  { id: 'repairs', label: 'Repairs', db: 'Repairs' }, { id: 'cleaning', label: 'Cleaning', db: 'Cleaning' },
  { id: 'tech', label: 'Tech', db: 'Tech' }, { id: 'delivery', label: 'Delivery', db: 'Delivery' },
  { id: 'lessons', label: 'Lessons', db: 'Lessons' }, { id: 'health', label: 'Fitness', db: 'Fitness and wellness' },
  { id: 'care', label: 'Care', db: 'Care' }, { id: 'garden', label: 'Garden', db: 'Garden' },
  { id: 'pets', label: 'Pets', db: 'Pets' }, { id: 'auto', label: 'Auto', db: 'Auto' },
];
export const catLabel = (db: string) => CATS.find((c) => c.db === db)?.label ?? db;
export const catIdOf = (db?: string) => CATS.find((c) => c.db === db)?.id ?? 'repairs';

// ---------- shared client state: address, cart, toast ----------
export type Address = { label: string; lat: number; lng: number; id?: string };
export type CartLine = Service & { qty: number };
export type Cart = { tasker: { id: string; name: string; color: string; initials: string; photo: string | null } | null; lines: Record<string, CartLine> };

type Ctx = {
  address: Address;
  addresses: SavedAddress[];
  selected: SavedAddress | null;
  selectAddress: (id: string) => void;
  reloadAddresses: () => Promise<SavedAddress[]>;
  cart: Cart;
  cartCount: number;
  subtotal: number;
  addToCart: (t: Cart['tasker'] & {}, s: Service, d: number) => void;
  clearCart: () => void;
  toast: string;
  showToast: (m: string) => void;
  favs: Record<string, boolean>;
  setFav: (id: string, on: boolean) => void;
  toggleFav: (id: string, now: boolean) => Promise<void>;
};
const C = createContext<Ctx | null>(null);

// Before the client saves an address, Home browses around Mandaluyong (design default).
const DEFAULT_ADDRESS: Address = { label: 'Set your address', lat: 14.5794, lng: 121.0359 };

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const reloadAddresses = useCallback(async () => {
    const { data } = await supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at');
    const list = (data ?? []) as SavedAddress[];
    setAddresses(list);
    setSelId((cur) => (cur && list.some((a) => a.id === cur) ? cur : list[0]?.id ?? null));
    return list;
  }, []);
  React.useEffect(() => { reloadAddresses(); }, []);
  const selected = addresses.find((a) => a.id === selId) ?? null;
  const address: Address = selected
    ? { id: selected.id, label: `${addrName(selected)} · ${selected.city}`, lat: selected.lat, lng: selected.lng }
    : DEFAULT_ADDRESS;
  const [cart, setCart] = useState<Cart>({ tasker: null, lines: {} });
  const [toast, setToast] = useState('');
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((m: string) => {
    clearTimeout(timer.current);
    setToast(m);
    timer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  const addToCart = useCallback((t: NonNullable<Cart['tasker']>, s: Service, d: number) => {
    setCart((c) => {
      // one tasker per booking: picking another tasker's service starts a new booking
      const lines = c.tasker?.id === t.id ? { ...c.lines } : {};
      const qty = (lines[s.id]?.qty ?? 0) + d;
      if (qty <= 0) delete lines[s.id]; else lines[s.id] = { ...s, qty };
      return { tasker: Object.keys(lines).length ? t : null, lines };
    });
    if (d > 0) showToast(`${s.name} added`);
  }, [showToast]);

  const setFav = useCallback((id: string, on: boolean) => setFavs((f) => ({ ...f, [id]: on })), []);
  const toggleFav = useCallback(async (id: string, now: boolean) => {
    setFavs((f) => ({ ...f, [id]: !now }));
    try {
      const on = await rpc<boolean>('toggle_favorite', { p_tasker: id });
      setFavs((f) => ({ ...f, [id]: on }));
      showToast(on ? 'Saved to your taskers' : 'Removed from saved');
    } catch (e: any) {
      setFavs((f) => ({ ...f, [id]: now }));
      showToast(e.message);
    }
  }, [showToast]);

  const lines = Object.values(cart.lines);
  const value = useMemo<Ctx>(() => ({
    address, addresses, selected, selectAddress: setSelId, reloadAddresses,
    cart, toast, showToast, addToCart, favs, setFav, toggleFav,
    cartCount: lines.reduce((n, l) => n + l.qty, 0),
    subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0),
    clearCart: () => setCart({ tasker: null, lines: {} }),
  }), [addresses, selId, cart, toast, favs]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useClient() {
  const v = useContext(C);
  if (!v) throw new Error('useClient outside ClientProvider');
  return v;
}
