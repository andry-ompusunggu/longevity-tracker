export const Colors = {
  // Backgrounds
  bg: '#F4F4F6',             // Soft light-gray canvas
  bgCard: '#FFFFFF',          // Pure white surfaces

  // Text
  textPrimary: '#1A1A1A',     // Deep charcoal (near-black)
  textSecondary: '#6B7280',   // Medium gray
  textMuted: '#9CA3AF',       // Light gray
  textInverse: '#FFFFFF',     // White text on dark bg

  // Accent colors for the 5 Pillars (transit-line inspired)
  muscle: '#EF4444',      // Red — strength & power
  muscleBg: '#FEF2F2',
  muscleBorder: '#FECACA',

  vo2: '#F97316',         // Orange — cardiovascular fire
  vo2Bg: '#FFF7ED',
  vo2Border: '#FED7AA',

  fasting: '#10B981',     // Green — nutritional health
  fastingBg: '#ECFDF5',
  fastingBorder: '#A7F3D0',

  sleep: '#8B5CF6',       // Purple — circadian restoration
  sleepBg: '#F5F3FF',
  sleepBorder: '#DDD6FE',

  brain: '#06B6D4',       // Cyan — cognitive sharpness
  brainBg: '#ECFEFF',
  brainBorder: '#A5F3FC',

  // UI colors
  border: '#E5E7EB',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',

  // Supercharged overachievement (>100%)
  supercharged: '#22C55E',           // Vibrant green for Muscle/VO2/Brain >100%
  superchargedBorder: '#86EFAC',
  superchargedBg: '#F0FDF4',
  superchargedBadge: '#FBBF24',      // Gold accent ⚡

  // Tab bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E5E7EB',
  tabActive: '#1A1A1A',
  tabInactive: '#9CA3AF',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 30,
  xxxl: 40,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  xxxxl: 32,
  full: 9999,
} as const;
