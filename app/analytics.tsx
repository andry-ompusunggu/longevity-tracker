import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getComplianceRate,
  getPerPillarCompliance,
  getDailyBreakdown,
  getDatabasePath,
  formatDate,
} from '../services/db';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

// ─── Constants ──────────────────────────────────────────────────────────────

interface PeriodOption {
  label: string;
  days: number;
}

const PERIODS: PeriodOption[] = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  compliance: number;
  muscle_bone: number;
  fasting_nutrition: number;
  brain_cognitive: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLabelStep(totalDays: number): number {
  if (totalDays <= 7) return 1;
  if (totalDays <= 30) return Math.max(1, Math.floor(totalDays / 8));
  if (totalDays <= 60) return Math.max(1, Math.floor(totalDays / 7));
  if (totalDays <= 90) return Math.max(1, Math.floor(totalDays / 6));
  return Math.max(1, Math.floor(totalDays / 6));
}

function formatShortDate(dateStr: string, totalDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (totalDays <= 60) return days[date.getDay()];
  return `${m}/${d}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const [selectedRate, setSelectedRate] = useState(0);
  const [weeklyRate, setWeeklyRate] = useState(0);
  const [monthlyRate, setMonthlyRate] = useState(0);
  const [muscleRate, setMuscleRate] = useState(0);
  const [fastingRate, setFastingRate] = useState(0);
  const [brainRate, setBrainRate] = useState(0);
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedDays, setSelectedDays] = useState(7);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRate, wRate, mRate, pRate, breakdown] = await Promise.all([
        getComplianceRate(selectedDays),
        getComplianceRate(7),
        getComplianceRate(30),
        getPerPillarCompliance(selectedDays),
        getDailyBreakdown(selectedDays),
      ]);
      setSelectedRate(sRate);
      setWeeklyRate(wRate);
      setMonthlyRate(mRate);
      setMuscleRate(pRate.muscle_bone);
      setFastingRate(pRate.fasting_nutrition);
      setBrainRate(pRate.brain_cognitive);
      setDailyData(breakdown);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedPercent = Math.round(selectedRate * 100);
  const weeklyPercent = Math.round(weeklyRate * 100);
  const monthlyPercent = Math.round(monthlyRate * 100);
  const musclePercent = Math.round(muscleRate * 100);
  const fastingPercent = Math.round(fastingRate * 100);
  const brainPercent = Math.round(brainRate * 100);
  const isMuscleOverachieving = musclePercent > 100;
  const labelStep = getLabelStep(dailyData.length);
  const isLongPeriod = dailyData.length > 14;

  const barColumnWidth = isLongPeriod ? Math.max(28, Math.min(40, (SCREEN_WIDTH - 48) / 15)) : undefined;
  const chartInnerWidth = isLongPeriod && barColumnWidth ? dailyData.length * (barColumnWidth + 4) : undefined;

  const selectedLabel = PERIODS.find((p) => p.days === selectedDays)?.label ?? `${selectedDays}D`;

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const sourcePath = getDatabasePath();
      const fileName = `longevity-${formatDate(new Date())}.db`;
      const sourceFile = new File(sourcePath);
      const destFile = new File(Paths.cache, fileName);
      sourceFile.copy(destFile);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destFile.uri, {
          mimeType: 'application/octet-stream',
          dialogTitle: 'Share Longevity Database',
        });
      } else {
        Alert.alert('Export', `Database saved to cache:\n${destFile.uri}`);
      }
    } catch (err) {
      console.error('Export failed:', err);
      Alert.alert('Export Failed', 'Could not export the database file.');
    } finally {
      setExporting(false);
    }
  }, []);

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

        {/* ── Period Selector ─────────────────────────────────── */}
        <View style={styles.periodRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.periodScrollContent}
          >
            <View style={styles.periodToggle}>
              {PERIODS.map((period) => (
                <TouchableOpacity
                  key={period.days}
                  style={[
                    styles.periodButton,
                    selectedDays === period.days && styles.periodButtonActive,
                  ]}
                  onPress={() => setSelectedDays(period.days)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.periodButtonText,
                      selectedDays === period.days && styles.periodButtonTextActive,
                    ]}
                  >
                    {period.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.textPrimary} />
          </View>
        ) : (
          <>
            {/* ── Main Compliance Card ────────────────────────── */}
            <View style={styles.mainCard}>
              <Text style={styles.mainCardLabel}>{selectedLabel} Compliance</Text>
              <Text
                style={[
                  styles.mainCardValue,
                  { color: selectedPercent >= 70 ? Colors.success : Colors.warning },
                ]}
              >
                {selectedPercent}%
              </Text>
              <View style={styles.mainProgressTrack}>
                <View
                  style={[
                    styles.mainProgressFill,
                    {
                      width: `${Math.min(selectedPercent, 100)}%` as any,
                      backgroundColor: selectedPercent >= 70 ? Colors.success : Colors.warning,
                    },
                  ]}
                />
              </View>
              <View style={styles.contextRow}>
                <View style={styles.contextItem}>
                  <Text style={styles.contextValue}>{weeklyPercent}%</Text>
                  <Text style={styles.contextLabel}>7-day</Text>
                </View>
                <View style={styles.contextDivider} />
                <View style={styles.contextItem}>
                  <Text style={styles.contextValue}>{monthlyPercent}%</Text>
                  <Text style={styles.contextLabel}>30-day</Text>
                </View>
              </View>
            </View>

            {/* ── Per-Pillar Breakdown ────────────────────────── */}
            <View style={styles.pillarSection}>
              <Text style={styles.sectionTitle}>Per-Pillar Breakdown</Text>
              <View style={styles.pillarRow}>
                <PillarCard
                  icon="fitness"
                  label="Muscle & Bone"
                  percent={musclePercent}
                  accentColor={isMuscleOverachieving ? Colors.achievement : Colors.muscle}
                  isOverachieving={isMuscleOverachieving}
                />
                <PillarCard
                  icon="nutrition"
                  label="Nutrient Window"
                  percent={fastingPercent}
                  accentColor={Colors.fasting}
                />
                <PillarCard
                  icon="school"
                  label="Brain & Nerve"
                  percent={brainPercent}
                  accentColor={Colors.brain}
                />
              </View>
            </View>

            {/* ── Bar Chart ───────────────────────────────────── */}
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>Daily Breakdown</Text>
              <View style={styles.chartCard}>
                <View style={styles.legend}>
                  <LegendItem color={Colors.muscle} label="Muscle" />
                  <LegendItem color={Colors.fasting} label="Nutrition" />
                  <LegendItem color={Colors.brain} label="Brain" />
                </View>

                {isLongPeriod ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.barsScroll}
                  >
                    <View style={{ flexDirection: 'row', gap: 4, minWidth: chartInnerWidth }}>
                      {dailyData.map((day, i) => (
                        <DayBar
                          key={day.date}
                          data={day}
                          showLabel={i % labelStep === 0 || i === dailyData.length - 1}
                          compact
                          totalDays={dailyData.length}
                        />
                      ))}
                    </View>
                  </ScrollView>
                ) : (
                  <View style={styles.barsContainer}>
                    {dailyData.map((day, i) => (
                      <DayBar
                        key={day.date}
                        data={day}
                        showLabel={i % labelStep === 0 || i === dailyData.length - 1}
                        totalDays={dailyData.length}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* ── Export Button ───────────────────────────────── */}
            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleExport}
              activeOpacity={0.8}
              disabled={exporting}
            >
              <Ionicons
                name={exporting ? 'hourglass-outline' : 'share-outline'}
                size={18}
                color={Colors.textInverse}
              />
              <Text style={styles.exportButtonText}>
                {exporting ? 'Exporting...' : 'Export Database'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Pillar Card ────────────────────────────────────────────────────────────

function PillarCard({
  icon,
  label,
  percent,
  accentColor,
  isOverachieving,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  percent: number;
  accentColor: string;
  isOverachieving?: boolean;
}) {
  const clampedPercent = Math.min(percent, 100);

  return (
    <View
      style={[
        styles.pillarCard,
        isOverachieving && styles.pillarCardAchievement,
      ]}
    >
      <View
        style={[
          styles.pillarIconBox,
          { backgroundColor: isOverachieving ? Colors.achievementBg : accentColor + '18' },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={isOverachieving ? Colors.achievement : accentColor}
        />
      </View>
      <Text
        style={[
          styles.pillarPercent,
          { color: accentColor },
          isOverachieving && { color: Colors.achievement },
        ]}
      >
        {percent}%
      </Text>
      <View style={styles.pillarProgressTrack}>
        <View
          style={[
            styles.pillarProgressFill,
            {
              width: `${Math.min(clampedPercent, 100)}%` as any,
              backgroundColor: isOverachieving ? Colors.achievement : accentColor,
            },
          ]}
        />
      </View>
      <Text style={styles.pillarLabel}>{label}</Text>
      {isOverachieving && (
        <View style={styles.achievementBadge}>
          <Ionicons name="flash" size={10} color={Colors.achievement} />
          <Text style={styles.achievementText}>Bonus</Text>
        </View>
      )}
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

function DayBar({
  data,
  showLabel,
  compact,
  totalDays,
}: {
  data: DayData;
  showLabel: boolean;
  compact?: boolean;
  totalDays: number;
}) {
  const label = formatShortDate(data.date, totalDays);

  return (
    <View style={[styles.dayBarColumn, compact && styles.dayBarColumnCompact]}>
      <View style={[styles.dayBarsStack, compact && styles.dayBarsStackCompact]}>
        {data.muscle_bone === 1 && (
          <View style={[styles.dayBarSegment, { backgroundColor: Colors.muscle }]} />
        )}
        {data.fasting_nutrition === 1 && (
          <View style={[styles.dayBarSegment, { backgroundColor: Colors.fasting }]} />
        )}
        {data.brain_cognitive === 1 && (
          <View style={[styles.dayBarSegment, { backgroundColor: Colors.brain }]} />
        )}
      </View>
      {showLabel && (
        <Text style={[styles.dayBarLabel, compact && styles.dayBarLabelCompact]}>
          {label}
        </Text>
      )}
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.sm,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // ── Period Selector ──────────────────────────────────────────
  periodRow: {
    marginBottom: Spacing.xl,
  },
  periodScrollContent: {
    paddingRight: Spacing.xl,
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  periodButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  periodButtonActive: {
    backgroundColor: Colors.textPrimary,
  },
  periodButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  periodButtonTextActive: {
    color: Colors.textInverse,
  },

  // ── Loading ──────────────────────────────────────────────────
  loadingBox: {
    paddingVertical: Spacing.xxxl * 2,
    alignItems: 'center',
  },

  // ── Main Compliance Card ──────────────────────────────────────
  mainCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxxl,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: Spacing.xxl,
  },
  mainCardLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  mainCardValue: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: FontSize.xxxl * 1.1,
  },
  mainProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  mainProgressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Context Row ──────────────────────────────────────────────
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  contextItem: {
    alignItems: 'center',
    gap: 2,
  },
  contextValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  contextLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contextDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },

  // ── Per-Pillar Breakdown ──────────────────────────────────────
  pillarSection: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  pillarRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pillarCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  pillarCardAchievement: {
    borderColor: Colors.achievementBorder,
    borderWidth: 1.5,
    backgroundColor: Colors.achievementBg,
  },
  pillarIconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarPercent: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pillarProgressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.bg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  pillarProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  pillarLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  achievementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.achievementBg,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.achievementBorder,
  },
  achievementText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.achievement,
  },

  // ── Section Title ────────────────────────────────────────────
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: Spacing.xs,
  },

  // ── Chart Section ────────────────────────────────────────────
  chartSection: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  chartCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxxl,
    padding: Spacing.xl,
    gap: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // ── Legend ───────────────────────────────────────────────────
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  // ── Bar Chart ────────────────────────────────────────────────
  barsScroll: {
    overflow: 'hidden',
  },
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
    gap: Spacing.xs,
  },
  dayBarColumnCompact: {
    flex: 0,
    width: 28,
  },
  dayBarsStack: {
    width: '100%',
    maxWidth: 24,
    height: 100,
    backgroundColor: Colors.bg,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  dayBarsStackCompact: {
    width: 20,
    maxWidth: 20,
    height: 80,
  },
  dayBarSegment: {
    width: '100%',
    height: 33,
  },
  dayBarLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  dayBarLabelCompact: {
    fontSize: 10,
  },

  // ── Export Button ────────────────────────────────────────────
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.textPrimary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    marginTop: Spacing.sm,
  },
  exportButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
