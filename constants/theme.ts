export const Colors = {
  // Backgrounds
  bg: '#0D1117',
  bgCard: '#161B22',
  bgCardActive: '#1C2333',
  bgInput: '#0D1117',

  // Text
  textPrimary: '#F0F6FC',
  textSecondary: '#8B949E',
  textMuted: '#484F58',

  // Accent colors for the Big Three
  muscle: '#FF6B6B',
  muscleBg: 'rgba(255, 107, 107, 0.12)',
  muscleBorder: 'rgba(255, 107, 107, 0.3)',

  fasting: '#51CF66',
  fastingBg: 'rgba(81, 207, 102, 0.12)',
  fastingBorder: 'rgba(81, 207, 102, 0.3)',

  brain: '#4ECDC4',
  brainBg: 'rgba(78, 205, 196, 0.12)',
  brainBorder: 'rgba(78, 205, 196, 0.3)',

  // UI colors
  border: '#30363D',
  success: '#3FB950',
  warning: '#D29922',
  danger: '#F85149',

  // Tab bar
  tabBar: '#0D1117',
  tabBarBorder: '#21262D',
  tabActive: '#F0F6FC',
  tabInactive: '#484F58',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  xxxl: 34,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
