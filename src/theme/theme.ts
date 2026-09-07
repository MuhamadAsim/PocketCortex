export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  cardBorder: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryForeground: string;
  secondary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  badgeBg: string;
  badgeBorder: string;
  progressBg: string;
  progressFill: string;
  divider: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  buttonDangerBg: string;
  buttonDangerText: string;
}

export const darkColors: ThemeColors = {
  background: '#0B0F19',
  surface: '#111827',
  card: '#161F33',
  cardBorder: '#222E47',
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  primaryForeground: '#FFFFFF',
  secondary: '#38BDF8',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  success: '#10B981',
  successBg: 'rgba(16, 185, 129, 0.15)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.15)',
  error: '#EF4444',
  errorBg: 'rgba(239, 68, 68, 0.15)',
  badgeBg: '#1E293B',
  badgeBorder: '#334155',
  progressBg: '#233048',
  progressFill: '#6366F1',
  divider: '#1E293B',
  buttonSecondaryBg: '#243048',
  buttonSecondaryText: '#E2E8F0',
  buttonDangerBg: 'rgba(239, 68, 68, 0.15)',
  buttonDangerText: '#F87171',
};

export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  primary: '#4F46E5',
  primaryLight: '#6366F1',
  primaryDark: '#4338CA',
  primaryForeground: '#FFFFFF',
  secondary: '#0284C7',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  success: '#059669',
  successBg: '#ECFDF5',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  error: '#DC2626',
  errorBg: '#FEF2F2',
  badgeBg: '#F1F5F9',
  badgeBorder: '#E2E8F0',
  progressBg: '#E2E8F0',
  progressFill: '#4F46E5',
  divider: '#E2E8F0',
  buttonSecondaryBg: '#F1F5F9',
  buttonSecondaryText: '#334155',
  buttonDangerBg: '#FEE2E2',
  buttonDangerText: '#DC2626',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
};

export const typography = {
  titleLarge: {
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  titleMedium: {
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  titleSmall: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  bodyLarge: {
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 13,
    lineHeight: 18,
  },
  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
  },
  caption: {
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
  },
};
