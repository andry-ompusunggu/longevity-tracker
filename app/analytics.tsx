import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getComplianceRate,
  getDailyBreakdown,
  getDayName,
} from '../services/db';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  compliance: number;
  muscle_bone: number;
  fasting_nutrition: number;
  brain_cognitive: number;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const [weeklyRate, setWeeklyRate] = useState(0);
  const [monthlyRate, setMonthlyRate] = useState(0);
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'7' | '30'>('7');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const days = viewMode === '7' ? 7 : 30;
      const [wRate, mRate, breakdown] = await Promise.all([
        getComplianceRate(7),
        getComplianceRate(30),
        getDailyBreakdown(days),
      ]);
      setWeeklyRate(wRate);
      setMonthlyRate(mRate);
      setDailyData(breakdown);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const weeklyPercent = Math.round(weeklyRate * 100);
  const monthlyPercent = Math.round(monthlyRate * 100);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Your compliance trends</Text>
        </View>

        {/* ── Period Toggle ───────────────────────────────────── */}
        <View style={styles.periodToggle}>
          <PeriodButton
            label="7 Days"
            active={viewMode === '7'}
            onPress={() => setViewMode('7')}
          />
          <PeriodButton
            label="30 Days"
            active={viewMode === '30'}
            onPress={() => setViewMode('30')}
          />
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.textPrimary} />
          </View>
        ) : (
          <>
            {/* ── Summary Cards ───────────────────────────────── */}
            <View style={styles.summaryRow}>
              <SummaryCard
                label="7-Day Compliance"
                value={weeklyPercent}
                icon="calendar-outline"
                color={weeklyPercent >= 70 ? Colors.success : Colors.warning}
              />
              <SummaryCard
                label="30-Day Compliance"
                value={monthlyPercent}
                icon="calendar-outline"
                color={monthlyPercent >= 70 ? Colors.success : Colors.warning}
              />
            </View>

            {/* ── Bar Chart ───────────────────────────────────── */}
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>
                Daily Breakdown ({viewMode === '7' ? '7' : '30'} Days)
              </Text>
              <View style={styles.chartContainer}>
                {/* Legend */}
                <View style={styles.legend}>
                  <LegendItem color={Colors.muscle} label="Muscle & Bone" />
                  <LegendItem color={Colors.fasting} label="Nutrient Window" />
                  <LegendItem color={Colors.brain} label="Brain & Nerve" />
                </View>

                {/* Bars */}
                <View style={styles.barsContainer}>
                  {dailyData.map((day) => (
                    <DayBar key={day.date} data={day} />
                  ))}
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Period Button ───────────────────────────────────────────────────────────

function PeriodButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.periodButton, active && styles.periodButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.periodButtonText,
          active && styles.periodButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons name={icon} size={20} color={Colors.textSecondary} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}%</Text>
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${value}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Legend Item ─────────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

// ─── Day Bar ─────────────────────────────────────────────────────────────────

function DayBar({ data }: { data: DayData }) {
  const dayName = getDayName(data.date);

  return (
    <View style={styles.dayBarColumn}>
      <View style={styles.dayBarsStack}>
        <View
          style={[
            styles.dayBarSegment,
            {
              height: `${data.muscle_bone ? 33 : 0}%` as any,
              backgroundColor: Colors.muscle,
            },
          ]}
        />
        <View
          style={[
            styles.dayBarSegment,
            {
              height: `${data.fasting_nutrition ? 33 : 0}%` as any,
              backgroundColor: Colors.fasting,
            },
          ]}
        />
        <View
          style={[
            styles.dayBarSegment,
            {
              height: `${data.brain_cognitive ? 33 : 0}%` as any,
              backgroundColor: Colors.brain,
            },
          ]}
        />
      </View>
      <Text style={styles.dayBarLabel}>{dayName}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },

  // Header
  header: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // Period Toggle
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
    marginBottom: Spacing.xl,
    alignSelf: 'flex-start',
  },
  periodButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  periodButtonActive: {
    backgroundColor: Colors.bg,
  },
  periodButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  periodButtonTextActive: {
    color: Colors.textPrimary,
  },

  // Loading
  loadingBox: {
    paddingVertical: Spacing.xxxl * 2,
    alignItems: 'center',
  },

  // Summary Row
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Chart Section
  chartSection: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chartContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },

  // Bars
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    minHeight: 120,
  },
  dayBarColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dayBarsStack: {
    width: '100%',
    maxWidth: 28,
    height: 100,
    backgroundColor: Colors.bg,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  dayBarSegment: {
    width: '100%',
  },
  dayBarLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
