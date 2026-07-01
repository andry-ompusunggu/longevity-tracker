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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getBiologicalDefenseScore,
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

// ─── Pillar config ───────────────────────────────────────────────────────────

interface PillarConfig {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  targetDesc: string;
  canSupercharge: boolean;
  infoYes: string;
  infoNo: string;
}

const PILLARS: PillarConfig[] = [
  {
    key: 'muscle_bone',
    label: 'Muscle & Bone',
    icon: 'fitness',
    color: Colors.muscle,
    targetDesc: '3x/week',
    canSupercharge: true,
    infoYes: 'Latihan dumbbell (Mechanical tension) / asupan protein pemulihan.',
    infoNo: 'Hanya duduk seharian tanpa stimulus mekanis pada otot/tulang.',
  },
  {
    key: 'vo2_heart',
    label: 'Mitochondria & VO₂',
    icon: 'flame',
    color: Colors.vo2,
    targetDesc: '2x/week',
    canSupercharge: true,
    infoYes: 'HIIT/Burpees (ngos-ngosan maksimal) 5-10 menit yang memacu denyut jantung.',
    infoNo: 'Tidak ada aktivitas yang meningkatkan denyut jantung secara signifikan.',
  },
  {
    key: 'fasting_food',
    label: 'Fasting & Real Food',
    icon: 'nutrition',
    color: Colors.fasting,
    targetDesc: '7x/week',
    canSupercharge: false,
    infoYes: 'Puasa 17:7 terjaga & High-protein meal prep (makanan utuh).',
    infoNo: 'Jendela puasa berantakan atau konsumsi makanan ultra-processed tanpa protein.',
  },
  {
    key: 'sleep_circadian',
    label: 'Sleep & Circadian',
    icon: 'moon',
    color: Colors.sleep,
    targetDesc: '7x/week',
    canSupercharge: false,
    infoYes: 'Cahaya matahari pagi (sirkadian reset) + No blue light 1 jam sebelum tidur.',
    infoNo: 'Tidur larut tanpa exposure sinar matahari pagi atau gadget sebelum tidur.',
  },
  {
    key: 'brain_cognitive',
    label: 'Brain & Cognitive',
    icon: 'school',
    color: Colors.brain,
    targetDesc: '5x/week',
    canSupercharge: true,
    infoYes: 'Kerja deep-focus (coding rumit / baca buku klasik) tanpa distraksi 30+ menit.',
    infoNo: 'Hanya kerja mekanis, scroll media sosial, atau konsumsi konten pasif.',
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  compliance: number;
  muscle_bone: number;
  vo2_heart: number;
  fasting_food: number;
  sleep_circadian: number;
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

// ─── Pillar color order for pill indicators ───────────────────────────────────

const PILLAR_KEYS: (keyof DayData & string)[] = [
  'muscle_bone',
  'vo2_heart',
  'fasting_food',
  'sleep_circadian',
  'brain_cognitive',
];

const PILLAR_COLORS: Record<string, string> = {
  muscle_bone: Colors.muscle,
  vo2_heart: Colors.vo2,
  fasting_food: Colors.fasting,
  sleep_circadian: Colors.sleep,
  brain_cognitive: Colors.brain,
};

const PILLAR_LABELS_SHORT: Record<string, string> = {
  muscle_bone: 'M',
  vo2_heart: 'V',
  fasting_food: 'F',
  sleep_circadian: 'S',
  brain_cognitive: 'B',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const [bdsRate, setBdsRate] = useState(0);
  const [weeklyBds, setWeeklyBds] = useState(0);
  const [monthlyBds, setMonthlyBds] = useState(0);
  const [pillarRates, setPillarRates] = useState<Record<string, number>>({});
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedDays, setSelectedDays] = useState(7);
  const [infoPillar, setInfoPillar] = useState<PillarConfig | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bds, wBds, mBds, pRate, breakdown] = await Promise.all([
        getBiologicalDefenseScore(selectedDays),
        getBiologicalDefenseScore(7),
        getBiologicalDefenseScore(30),
        getPerPillarCompliance(selectedDays),
        getDailyBreakdown(selectedDays),
      ]);
      setBdsRate(bds);
      setWeeklyBds(wBds);
      setMonthlyBds(mBds);
      setPillarRates(pRate);
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

  const bdsPercent = Math.round(bdsRate * 100);
  const weeklyBdsPercent = Math.round(weeklyBds * 100);
  const monthlyBdsPercent = Math.round(monthlyBds * 100);
  const labelStep = getLabelStep(dailyData.length);
  const isLongPeriod = dailyData.length > 14;

  const barColumnWidth = isLongPeriod ? Math.max(20, Math.min(28, (SCREEN_WIDTH - 48) / 22)) : undefined;
  const chartInnerWidth = isLongPeriod && barColumnWidth ? dailyData.length * (barColumnWidth + 2) : undefined;

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
          <Text style={styles.headerSubtitle}>5-Pillar Biological Defense Score</Text>
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
            {/* ── BDS Main Card ───────────────────────────────── */}
            <View style={styles.mainCard}>
              <View style={styles.bdsLabelRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.mainCardLabel}>{selectedLabel} Biological Defense</Text>
              </View>
              <Text
                style={[
                  styles.mainCardValue,
                  { color: bdsPercent >= 70 ? Colors.success : Colors.warning },
                ]}
              >
                {bdsPercent}%
              </Text>
              <View style={styles.mainProgressTrack}>
                <View
                  style={[
                    styles.mainProgressFill,
                    {
                      width: `${Math.min(bdsPercent, 100)}%` as any,
                      backgroundColor: bdsPercent >= 70 ? Colors.success : Colors.warning,
                    },
                  ]}
                />
              </View>
              <View style={styles.contextRow}>
                <View style={styles.contextItem}>
                  <Text style={styles.contextValue}>{weeklyBdsPercent}%</Text>
                  <Text style={styles.contextLabel}>7-day</Text>
                </View>
                <View style={styles.contextDivider} />
                <View style={styles.contextItem}>
                  <Text style={styles.contextValue}>{monthlyBdsPercent}%</Text>
                  <Text style={styles.contextLabel}>30-day</Text>
                </View>
              </View>
            </View>

            {/* ── 5 Pillar Progress Bars ───────────────────────── */}
            <View style={styles.pillarSection}>
              <Text style={styles.sectionTitle}>The 5 Pillars</Text>
              {PILLARS.map((pillar) => {
                const rate = pillarRates[pillar.key] ?? 0;
                const percent = Math.round(rate * 100);
                const isSupercharged = pillar.canSupercharge && percent > 100;
                const barColor = isSupercharged ? Colors.supercharged : pillar.color;
                const barWidth = `${Math.min(percent, 100)}%` as any;

                return (
                  <TouchableOpacity
                    key={pillar.key}
                    style={styles.pillarBarContainer}
                    onPress={() => setInfoPillar(pillar)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pillarBarHeader}>
                      <View style={styles.pillarBarLabelRow}>
                        <Ionicons name={pillar.icon} size={16} color={barColor} />
                        <Text style={[styles.pillarBarLabel, { color: barColor }]} numberOfLines={1}>
                          {pillar.label}
                        </Text>
                        <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
                        {isSupercharged && (
                          <View style={styles.superchargedBadge}>
                            <Ionicons name="flash" size={11} color={Colors.superchargedBadge} />
                            <Text style={styles.superchargedText}>Supercharged ⚡</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.pillarBarPercent, { color: barColor }]}>
                        {percent}%
                      </Text>
                    </View>
                    <View style={styles.pillarBarTrack}>
                      <View
                        style={[
                          styles.pillarBarFill,
                          {
                            width: barWidth,
                            backgroundColor: barColor,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.pillarBarTarget}>{pillar.targetDesc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Daily Pill Indicators ────────────────────────── */}
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>Daily Breakdown</Text>
              <View style={styles.chartCard}>
                {/* 5-pillar color legend */}
                <View style={styles.legend}>
                  <LegendItem color={Colors.muscle} label="Muscle" />
                  <LegendItem color={Colors.vo2} label="VO₂" />
                  <LegendItem color={Colors.fasting} label="Food" />
                  <LegendItem color={Colors.sleep} label="Sleep" />
                  <LegendItem color={Colors.brain} label="Brain" />
                </View>

                {isLongPeriod ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.pillsScroll}
                  >
                    <View style={{ flexDirection: 'row', gap: 2, minWidth: chartInnerWidth }}>
                      {dailyData.map((day, i) => (
                        <DayPill
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
                  <View style={styles.pillsContainer}>
                    {dailyData.map((day, i) => (
                      <DayPill
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

      {/* ── Pillar Info Modal ──────────────────────────────────── */}
      <Modal
        visible={infoPillar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoPillar(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {infoPillar && (
              <>
                <View style={styles.infoModalHeader}>
                  <Ionicons name={infoPillar.icon} size={24} color={infoPillar.color} />
                  <Text style={styles.infoModalTitle}>{infoPillar.label}</Text>
                </View>

                <Text style={styles.modalSectionLabel}>Klik YA jika:</Text>
                <Text style={styles.modalBody}>{infoPillar.infoYes}</Text>

                <Text style={styles.modalSectionLabel}>Biarkan TIDAK jika:</Text>
                <Text style={styles.modalBody}>{infoPillar.infoNo}</Text>

                <Text style={styles.modalTargetText}>Target: {infoPillar.targetDesc}</Text>
              </>
            )}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setInfoPillar(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>Mengerti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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

// ─── Day Pill (5 mini circles per day instead of stacked bars) ────────────────

function DayPill({
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
    <View style={[styles.dayPillColumn, compact && styles.dayPillColumnCompact]}>
      <View style={styles.dayPillStack}>
        {PILLAR_KEYS.map((key) => {
          const isActive = data[key] === 1;
          const color = PILLAR_COLORS[key];
          return (
            <View
              key={key}
              style={[
                styles.dayPillCircle,
                compact && styles.dayPillCircleCompact,
                {
                  backgroundColor: isActive ? color : Colors.pillBg,
                  borderColor: isActive ? color : Colors.pillInactive,
                },
              ]}
            />
          );
        })}
      </View>
      {showLabel && (
        <Text style={[styles.dayPillLabel, compact && styles.dayPillLabelCompact]}>
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

  // ── BDS Main Card ────────────────────────────────────────────
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
  bdsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
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

  // ── 5 Pillar Progress Bars ───────────────────────────────────
  pillarSection: {
    gap: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  pillarBarContainer: {
    gap: Spacing.xs,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillarBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillarBarLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
    marginRight: Spacing.sm,
  },
  pillarBarLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  pillarBarPercent: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  pillarBarTrack: {
    width: '100%',
    height: 10,
    backgroundColor: Colors.bg,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  pillarBarFill: {
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  pillarBarTarget: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  superchargedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.superchargedBg,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.superchargedBorder,
  },
  superchargedText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.supercharged,
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

  // ── Daily Pill Indicators ────────────────────────────────────
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
    gap: Spacing.md,
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

  // ── Pill Indicators ──────────────────────────────────────────
  pillsScroll: {
    overflow: 'hidden',
  },
  pillsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  dayPillColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dayPillColumnCompact: {
    flex: 0,
    width: 20,
  },
  dayPillStack: {
    flexDirection: 'column',
    gap: 3,
    alignItems: 'center',
  },
  dayPillCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  dayPillCircleCompact: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  dayPillLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  dayPillLabelCompact: {
    fontSize: 8,
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

  // ── Info Modal ──────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  modalContent: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxxl,
    padding: Spacing.xxl,
    maxWidth: 400,
    width: '100%',
    gap: Spacing.md,
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  infoModalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  modalSectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  modalBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  modalTargetText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  modalCloseButton: {
    backgroundColor: Colors.textPrimary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  modalCloseText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
