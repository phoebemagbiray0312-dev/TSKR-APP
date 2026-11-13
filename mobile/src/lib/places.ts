// Approximate city centers for the areas TSKR is open in (design: Home "coming soon" list).
// Used to place a typed address until the map pin (Google Maps) is connected.
export const CITIES: { name: string; lat: number; lng: number }[] = [
  // Metro Manila
  { name: 'Mandaluyong', lat: 14.5794, lng: 121.0359 }, { name: 'Makati', lat: 14.5547, lng: 121.0244 },
  { name: 'Pasig', lat: 14.5764, lng: 121.0851 }, { name: 'San Juan', lat: 14.6019, lng: 121.0355 },
  { name: 'Quezon City', lat: 14.6760, lng: 121.0437 }, { name: 'Manila', lat: 14.5995, lng: 120.9842 },
  { name: 'Taguig', lat: 14.5176, lng: 121.0509 }, { name: 'Pasay', lat: 14.5378, lng: 121.0014 },
  { name: 'Parañaque', lat: 14.4793, lng: 121.0198 }, { name: 'Las Piñas', lat: 14.4445, lng: 120.9939 },
  { name: 'Muntinlupa', lat: 14.4081, lng: 121.0415 }, { name: 'Marikina', lat: 14.6507, lng: 121.1029 },
  { name: 'Caloocan', lat: 14.6507, lng: 120.9667 }, { name: 'Malabon', lat: 14.6681, lng: 120.9658 },
  { name: 'Navotas', lat: 14.6667, lng: 120.9417 }, { name: 'Valenzuela', lat: 14.7011, lng: 120.9830 },
  { name: 'Pateros', lat: 14.5446, lng: 121.0687 },
  // nearby provinces
  { name: 'Antipolo', lat: 14.5865, lng: 121.1760 }, { name: 'Cainta', lat: 14.5786, lng: 121.1222 },
  { name: 'Taytay', lat: 14.5692, lng: 121.1325 }, { name: 'Bacoor', lat: 14.4590, lng: 120.9290 },
  { name: 'Imus', lat: 14.4297, lng: 120.9367 }, { name: 'Dasmariñas', lat: 14.3294, lng: 120.9367 },
  { name: 'Santa Rosa', lat: 14.3122, lng: 121.1114 }, { name: 'Calamba', lat: 14.2117, lng: 121.1653 },
  { name: 'San Pedro', lat: 14.3595, lng: 121.0473 }, { name: 'Malolos', lat: 14.8527, lng: 120.8160 },
  { name: 'Meycauayan', lat: 14.7346, lng: 120.9573 }, { name: 'San Jose del Monte', lat: 14.8139, lng: 121.0453 },
  { name: 'San Fernando', lat: 15.0286, lng: 120.6898 }, { name: 'Angeles', lat: 15.1450, lng: 120.5887 },
  { name: 'Lipa', lat: 13.9411, lng: 121.1631 }, { name: 'Tanauan', lat: 14.0863, lng: 121.1500 },
  { name: 'Santo Tomas', lat: 14.1077, lng: 121.1416 },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\bcity\b|\bof\b/g, '').replace(/[^a-z ]/g, '').trim();

/** Find the city the client typed. Returns null when TSKR isn't open there yet. */
export function findCity(input: string) {
  const n = norm(input);
  if (!n) return null;
  const alias: Record<string, string> = { qc: 'quezon', mandaluyong: 'mandaluyong', bgc: 'taguig', 'sta rosa': 'santa rosa', 'sto tomas': 'santo tomas', sjdm: 'san jose del monte' };
  const key = alias[n] ?? n;
  return CITIES.find((c) => norm(c.name) === key) ?? CITIES.find((c) => norm(c.name).startsWith(key) || key.startsWith(norm(c.name))) ?? null;
}

export type SavedAddress = {
  id: string; label: 'home' | 'work' | 'partner' | 'other'; custom_label: string | null; street: string; unit: string | null;
  barangay: string; city: string; landmark: string | null; lat: number; lng: number; is_default: boolean;
};
export const addrName = (a: SavedAddress) =>
  a.label === 'other' ? a.custom_label || 'Other' : a.label === 'partner' ? 'Partner' : a.label[0].toUpperCase() + a.label.slice(1);
export const addrLine = (a: SavedAddress) => [a.unit, a.street, a.barangay, a.city].filter(Boolean).join(', ');
