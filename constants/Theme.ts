export type SeasonId = 'default' | 'fall' | 'thanksgiving' | 'christmas';

export type SeasonalTheme = {
  id: SeasonId;
  label: string;
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  gold: string;
  goldSoft: string;
  danger: string;
  title: string;
  projected: string;
  success: string;
  lightBg: string;
  lightCard: string;
  lightWash: string;
};

const defaultTheme: SeasonalTheme = {
  id: 'default',
  label: '',
  bg: '#0F172A',
  card: '#1E293B',
  border: '#334155',
  text: '#F8FAFC',
  muted: '#94A3B8',
  faint: '#475569',
  accent: '#3B82F6',
  accentSoft: '#3B82F633',
  gold: '#F59E0B',
  goldSoft: '#F59E0B33',
  danger: '#EF4444',
  title: '#F8FAFC',
  projected: '#F59E0B',
  success: '#10B981',
  lightBg: '#F1F5F9',
  lightCard: '#FFFFFF',
  lightWash: '#E0F2FE',
};

const fallTheme: SeasonalTheme = {
  id: 'fall',
  label: 'Fall',
  bg: '#1C1008',
  card: '#3D2414',
  border: '#6B3E1F',
  text: '#FFF6EB',
  muted: '#D4B896',
  faint: '#8A5A3A',
  accent: '#E85D04',
  accentSoft: '#E85D0433',
  gold: '#F4A261',
  goldSoft: '#F4A26133',
  danger: '#DC2626',
  title: '#F4A261',
  projected: '#F4A261',
  success: '#F4A261',
  lightBg: '#FFF4E8',
  lightCard: '#FFFBF5',
  lightWash: '#FED7AA',
};

const thanksgivingTheme: SeasonalTheme = {
  id: 'thanksgiving',
  label: 'Thanksgiving',
  bg: '#1A120C',
  card: '#4A1F12',
  border: '#7C2D12',
  text: '#FFF7ED',
  muted: '#D6B89C',
  faint: '#9A6B4F',
  accent: '#C2410C',
  accentSoft: '#C2410C33',
  gold: '#EAB308',
  goldSoft: '#EAB30833',
  danger: '#B91C1C',
  title: '#FBBF24',
  projected: '#EAB308',
  success: '#EAB308',
  lightBg: '#FFF7ED',
  lightCard: '#FFFBEB',
  lightWash: '#FDE68A',
};

const christmasTheme: SeasonalTheme = {
  id: 'christmas',
  label: 'Christmas',
  bg: '#1A0B0D',
  card: '#3D1418',
  border: '#5C2428',
  text: '#FFF5F5',
  muted: '#D4B8BC',
  faint: '#8A5A5E',
  accent: '#C41E3A',
  accentSoft: '#C41E3A33',
  gold: '#E8B86D',
  goldSoft: '#E8B86D33',
  danger: '#FB7185',
  title: '#E8B86D',
  projected: '#E8B86D',
  success: '#E8B86D',
  lightBg: '#FDECEC',
  lightCard: '#FFF8F8',
  lightWash: '#FEE2E2',
};

export const Theme = christmasTheme;

export function getSeasonalTheme(monthYear?: string | null): SeasonalTheme {
  const month = (monthYear || currentMonthYear()).slice(5, 7);
  if (month === '10') return fallTheme;
  if (month === '11') return thanksgivingTheme;
  if (month === '12') return christmasTheme;
  return defaultTheme;
}

export function currentMonthYear() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}
