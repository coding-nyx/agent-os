import { ModuleTheme } from '@/lib/module-manifest';

export interface ModuleThemeTokens {
  accent: string;
  accentHover: string;
  accentMuted: string;
  accentFaint: string;
  accentBorder: string;
  accentRing: string;
}

export const MODULE_THEME_TOKENS: Record<ModuleTheme, ModuleThemeTokens> = {
  indigo: {
    accent: 'rgb(99 102 241)',
    accentHover: 'rgb(129 140 248)',
    accentMuted: 'rgb(99 102 241 / 0.10)',
    accentFaint: 'rgb(99 102 241 / 0.05)',
    accentBorder: 'rgb(99 102 241 / 0.20)',
    accentRing: 'rgb(99 102 241 / 0.30)',
  },
  orange: {
    accent: 'rgb(234 88 12)',
    accentHover: 'rgb(249 115 22)',
    accentMuted: 'rgb(234 88 12 / 0.10)',
    accentFaint: 'rgb(234 88 12 / 0.05)',
    accentBorder: 'rgb(234 88 12 / 0.20)',
    accentRing: 'rgb(234 88 12 / 0.30)',
  },
  cyan: {
    accent: 'rgb(8 145 178)',
    accentHover: 'rgb(6 182 212)',
    accentMuted: 'rgb(8 145 178 / 0.10)',
    accentFaint: 'rgb(8 145 178 / 0.05)',
    accentBorder: 'rgb(8 145 178 / 0.20)',
    accentRing: 'rgb(8 145 178 / 0.30)',
  },
  emerald: {
    accent: 'rgb(16 185 129)',
    accentHover: 'rgb(52 211 153)',
    accentMuted: 'rgb(16 185 129 / 0.10)',
    accentFaint: 'rgb(16 185 129 / 0.05)',
    accentBorder: 'rgb(16 185 129 / 0.20)',
    accentRing: 'rgb(16 185 129 / 0.30)',
  },
  sky: {
    accent: 'rgb(14 165 233)',
    accentHover: 'rgb(56 189 248)',
    accentMuted: 'rgb(14 165 233 / 0.10)',
    accentFaint: 'rgb(14 165 233 / 0.05)',
    accentBorder: 'rgb(14 165 233 / 0.20)',
    accentRing: 'rgb(14 165 233 / 0.30)',
  },
  lime: {
    accent: 'rgb(132 204 22)',
    accentHover: 'rgb(163 230 53)',
    accentMuted: 'rgb(132 204 22 / 0.10)',
    accentFaint: 'rgb(132 204 22 / 0.05)',
    accentBorder: 'rgb(132 204 22 / 0.20)',
    accentRing: 'rgb(132 204 22 / 0.30)',
  },
  rose: {
    accent: 'rgb(244 63 94)',
    accentHover: 'rgb(251 113 133)',
    accentMuted: 'rgb(244 63 94 / 0.10)',
    accentFaint: 'rgb(244 63 94 / 0.05)',
    accentBorder: 'rgb(244 63 94 / 0.20)',
    accentRing: 'rgb(244 63 94 / 0.30)',
  },
  fuchsia: {
    accent: 'rgb(217 70 239)',
    accentHover: 'rgb(232 121 249)',
    accentMuted: 'rgb(217 70 239 / 0.10)',
    accentFaint: 'rgb(217 70 239 / 0.05)',
    accentBorder: 'rgb(217 70 239 / 0.20)',
    accentRing: 'rgb(217 70 239 / 0.30)',
  },
  slate: {
    accent: 'rgb(100 116 139)',
    accentHover: 'rgb(148 163 184)',
    accentMuted: 'rgb(100 116 139 / 0.10)',
    accentFaint: 'rgb(100 116 139 / 0.05)',
    accentBorder: 'rgb(100 116 139 / 0.20)',
    accentRing: 'rgb(100 116 139 / 0.30)',
  },
  violet: {
    accent: 'rgb(139 92 246)',
    accentHover: 'rgb(167 139 250)',
    accentMuted: 'rgb(139 92 246 / 0.10)',
    accentFaint: 'rgb(139 92 246 / 0.05)',
    accentBorder: 'rgb(139 92 246 / 0.20)',
    accentRing: 'rgb(139 92 246 / 0.30)',
  },
};
