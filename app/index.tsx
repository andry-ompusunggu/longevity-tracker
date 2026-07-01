import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getLogByDate,
  getTodayString,
  shiftDate,
  formatDateHuman,
  getComplianceRate,
  toggleField,
  upsertLog,
  getWeeklySummary,
  getWeeklyFocusSuggestion,
  WeeklySummary,
} from '../services/db';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

type PillarKey = 'muscle_bone' | 'vo2_heart' | 'fasting_food' | 'sleep_circadian' | 'brain_cognitive';

interface ToggleCardConfig {
  key: PillarKey;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  color: string;
  colorBg: string;
  colorBorder: string;
}

// ─── Pillar Order (by natural user flow: Morning → Siang → Sore → Malam → Kapan Saja) ───

const PILLAR_ORDER: PillarKey[] = [
  'sleep_circadian',    // ☀️ Morning — check sunlight
  'fasting_food',       // 🥗 Siang — tracking fast
  'muscle_bone',        // 🏋️ Sore — workout
  'vo2_heart',          // 🫀 Sore — HIIT
  'brain_cognitive',    // 🧠 Kapan saja — deep focus
];

// Pillar info for progress dots
const PILLAR_DOT_INFO: Record<PillarKey, { color: string; label: string }> = {
  sleep_circadian: { color: Colors.sleep, label: 'Sleep' },
  fasting_food: { color: Colors.fasting, label: 'Fasting' },
  muscle_bone: { color: Colors.muscle, label: 'Muscle' },
  vo2_heart: { color: Colors.vo2, label: 'VO₂' },
  brain_cognitive: { color: Colors.brain, label: 'Brain' },
};

// Module-level constant — never recreated
const CARDS: Record<PillarKey, ToggleCardConfig> = {
  sleep_circadian: {
    key: 'sleep_circadian',
    label: 'Sleep & Circadian',
    subtitle: 'Morning sun + no blue light PM',
    icon: 'moon-outline',
    iconActive: 'moon',
    color: Colors.sleep,
    colorBg: Colors.sleepBg,
    colorBorder: Colors.sleepBorder,
  },
  fasting_food: {
    key: 'fasting_food',
    label: 'Fasting & Real Food',
    subtitle: '17:7 IF + high-protein meal prep',
    icon: 'nutrition-outline',
    iconActive: 'nutrition',
    color: Colors.fasting,
    colorBg: Colors.fastingBg,
    colorBorder: Colors.fastingBorder,
  },
  muscle_bone: {
    key: 'muscle_bone',
    label: 'Muscle & Bone',
    subtitle: 'Strength training & impact work',
    icon: 'fitness-outline',
    iconActive: 'fitness',
    color: Colors.muscle,
    colorBg: Colors.muscleBg,
    colorBorder: Colors.muscleBorder,
  },
  vo2_heart: {
    key: 'vo2_heart',
    label: 'Mitochondria & VO₂',
    subtitle: 'HIIT / cardio burst 5-10 min',
    icon: 'flame-outline',
    iconActive: 'flame',
    color: Colors.vo2,
    colorBg: Colors.vo2Bg,
    colorBorder: Colors.vo2Border,
  },
  brain_cognitive: {
    key: 'brain_cognitive',
    label: 'Brain & Cognitive',
    subtitle: 'Deep focus work without distraction',
    icon: 'school-outline',
    iconActive: 'school',
    color: Colors.brain,
    colorBg: Colors.brainBg,
    colorBorder: Colors.brainBorder,
  },
};

// ─── Boundary Rules Info Text ────────────────────────────────────────────

const INFO_TEXT: Record<string, { title: string; yes: string; no: string; note?: string }> = {
  muscle_bone: {
    title: '🏋️ Muscle & Bone',
    yes: '1 = Latihan dumbbell (Mechanical tension) / asupan protein pemulihan untuk sintesis otot optimal.',
    no: 'Hanya duduk seharian tanpa stimulus mekanis pada otot/tulang.',
  },
  vo2_heart: {
    title: '🫀 Mitochondria & VO₂',
    yes: '1 = Latihan HIIT / Burpees (ngos-ngosan maksimal) 5-10 menit yang memacu denyut jantung.',
    no: 'Tidak ada aktivitas yang meningkatkan denyut jantung secara signifikan.',
  },
  fasting_food: {
    title: '🥗 Fasting & Real Food',
    yes: '1 = Puasa 17:7 terjaga & High-protein meal prep (makanan utuh, bukan olahan).',
    no: 'Jendela puasa berantakan atau konsumsi makanan ultra-processed tanpa protein.',
  },
  sleep_circadian: {
    title: '☀️ Sleep & Circadian',
    yes: '1 = Cahaya matahari pagi (sirkadian reset) + No blue light minimal 1 jam sebelum tidur.',
    no: 'Tidur larut tanpa exposure sinar matahari pagi atau penggunaan gadget sebelum tidur.',
  },
  brain_cognitive: {
    title: '🧠 Brain & Cognitive',
    yes: '1 = Kerja deep-focus (coding logika rumit / baca buku klasik) tanpa distraksi selama minimal 30 menit.',
    no: 'Hanya kerja mekanis, scroll media sosial, atau konsumsi konten pasif.',
  },
};

const PILLAR_LABELS: Record<PillarKey, string> = {
  muscle_bone: 'Muscle & Bone',
  vo2_heart: 'Mitochondria & VO₂',
  fasting_food: 'Fasting & Real Food',
  sleep_circadian: 'Sleep & Circadian',
  brain_cognitive: 'Brain & Cognitive',
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const today = useMemo(() => getTodayString(), []);
  const greeting = useMemo(() => getGreeting(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [toggles, setToggles] = useState<Record<PillarKey, number>>({
    muscle_bone: 0,
    vo2_heart: 0,
    fasting_food: 0,
    sleep_circadian: 0,
    brain_cognitive: 0,
  });
  const [notes, setNotes] = useState('');
  const [compliance, setCompliance] = useState(0);
  const [totalDaysData, setTotalDaysData] = useState(0);
  const [loading, setLoading] = useState(true);
  const [infoPillar, setInfoPillar] = useState<string | null>(null);

  // Weekly review state
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const isToday = selectedDate === today;
  const isPastDate = selectedDate < today;
  const hasFewDays = totalDaysData > 0 && totalDaysData < 3;

  // Load data for the selected date
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [log, rate, bds] = await Promise.all([
          getLogByDate(selectedDate),
          getComplianceRate(7),
          getComplianceRate(selectedDate === today ? 7 : 1),
        ]);
        if (log) {
          setToggles({
            muscle_bone: log.muscle_bone,
            vo2_heart: log.vo2_heart,
            fasting_food: log.fasting_food,
            sleep_circadian: log.sleep_circadian,
            brain_cognitive: log.brain_cognitive,
          });
          setNotes(log.notes || '');
        } else {
          setToggles({
            muscle_bone: 0,
            vo2_heart: 0,
            fasting_food: 0,
            sleep_circadian: 0,
            brain_cognitive: 0,
          });
          setNotes('');
        }
        setCompliance(rate);
        // Count how many days have data by checking if bds > 0 for 1-day period
        const dayCount = await getLogByDate(today);
        setTotalDaysData(dayCount ? 1 : 0);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDate]);

  // Date navigation
  const goToPrevDay = useCallback(() => {
    setSelectedDate((prev) => shiftDate(prev, -1));
  }, []);

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const next = shiftDate(prev, 1);
      return next > today ? prev : next;
    });
  }, [today]);

  const goToToday = useCallback(() => {
    setSelectedDate(today);
  }, [today]);

  // Toggle handler
  const handleToggle = useCallback(
    async (field: PillarKey) => {
      setToggles((prev) => ({
        ...prev,
        [field]: prev[field] === 1 ? 0 : 1,
      }));

      try {
        await toggleField(selectedDate, field);
        const rate = await getComplianceRate(7);
        setCompliance(rate);
      } catch (err) {
        setToggles((prev) => ({
          ...prev,
          [field]: prev[field] === 1 ? 0 : 1,
        }));
        console.error('Toggle failed:', err);
      }
    },
    [selectedDate]
  );

  // Info modal handlers
  const handleShowInfo = useCallback((pillar: string) => {
    setInfoPillar(pillar);
  }, []);

  const handleHideInfo = useCallback(() => {
    setInfoPillar(null);
  }, []);

  // Weekly Review handlers
  const handleOpenWeeklyReview = useCallback(async () => {
    setWeeklyLoading(true);
    setShowWeeklyReview(true);
    try {
      const summary = await getWeeklySummary();
      setWeeklySummary(summary);
    } catch (err) {
      console.error('Failed to load weekly summary:', err);
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  const handleCloseWeeklyReview = useCallback(() => {
    setShowWeeklyReview(false);
    setWeeklySummary(null);
  }, []);

  // Save notes handler
  const handleSaveNote = useCallback(async () => {
    const trimmed = notes.trim().slice(0, 100);
    try {
      await upsertLog(selectedDate, { notes: trimmed });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [notes, selectedDate]);

  const compliancePercent = Math.round(compliance * 100);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* Date navigation row */}
            <View style={styles.dateNavRow}>
              <TouchableOpacity
                onPress={goToPrevDay}
                style={styles.dateArrow}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>

              <View style={styles.dateCenter}>
                <Text style={styles.greetingLabel}>
                  {isToday ? greeting : 'Viewing'}
                </Text>
                <Text style={styles.dateText}>{formatDateHuman(selectedDate)}</Text>
              </View>

              <TouchableOpacity
                onPress={goToNextDay}
                style={styles.dateArrow}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={isToday ? Colors.textMuted : Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* "Today" button when viewing past dates */}
            {isPastDate && (
              <TouchableOpacity style={styles.todayButton} onPress={goToToday} activeOpacity={0.7}>
                <Ionicons name="today-outline" size={14} color={Colors.textPrimary} />
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
            )}

            {/* Grace period message for new users */}
            {hasFewDays && isToday && (
              <View style={styles.gracePeriodRow}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.warning} />
                <Text style={styles.gracePeriodText}>Data baru — BDS akan akurat setelah 7 hari</Text>
              </View>
            )}
          </View>

          {/* BDS Badge + Mini Progress Dots */}
          <View style={styles.bdsContainer}>
            <View style={styles.complianceBadge}>
              <Text style={styles.complianceLabel}>Weekly</Text>
              <Text
                style={[
                  styles.complianceValue,
                  { color: compliancePercent >= 70 ? Colors.success : Colors.warning },
                ]}
              >
                {compliancePercent}%
              </Text>
            </View>
            {/* Mini progress dots — shows today's toggle status */}
            {isToday && (
              <View style={styles.progressDots}>
                {PILLAR_ORDER.map((key) => (
                  <View
                    key={key}
                    style={[
                      styles.progressDot,
                      {
                        backgroundColor: toggles[key] === 1 ? PILLAR_DOT_INFO[key].color : Colors.pillInactive,
                      },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Weekly Review Button ─────────────────────────────── */}
        <TouchableOpacity
          style={styles.weeklyReviewButton}
          onPress={handleOpenWeeklyReview}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={16} color={Colors.textPrimary} />
          <Text style={styles.weeklyReviewButtonText}>Week in Review</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* ── Today's 5 Pillars ────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Today's 5 Pillars</Text>
        <View style={styles.cardsContainer}>
          {PILLAR_ORDER.map((key) => {
            const card = CARDS[key];
            return (
              <ToggleCard
                key={card.key}
                config={card}
                active={toggles[card.key] === 1}
                onPress={() => handleToggle(card.key)}
                onInfoPress={() => handleShowInfo(card.key)}
              />
            );
          })}
        </View>

        {/* ── Quick Note ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Note</Text>
        <View style={styles.noteCard}>
          <TextInput
            style={styles.noteInput}
            placeholder="How are you feeling today?"
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            maxLength={100}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={styles.noteSaveButton}
            onPress={handleSaveNote}
            activeOpacity={0.8}
          >
            <Ionicons name="save-outline" size={18} color={Colors.textInverse} />
            <Text style={styles.noteSaveText}>Save Note</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Info Modal ─────────────────────────────────────── */}
      <Modal
        visible={infoPillar !== null}
        transparent
        animationType="fade"
        onRequestClose={handleHideInfo}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {infoPillar && INFO_TEXT[infoPillar] && (
              <>
                <Text style={styles.modalTitle}>
                  {INFO_TEXT[infoPillar].title}
                </Text>

                <Text style={styles.modalSectionLabel}>Klik YA (●) jika:</Text>
                <Text style={styles.modalBody}>{INFO_TEXT[infoPillar].yes}</Text>

                <Text style={styles.modalSectionLabel}>Biarkan TIDAK (○) jika:</Text>
                <Text style={styles.modalBody}>{INFO_TEXT[infoPillar].no}</Text>

                {INFO_TEXT[infoPillar].note && (
                  <Text style={styles.modalNote}>{INFO_TEXT[infoPillar].note}</Text>
                )}
              </>
            )}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={handleHideInfo}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>Mengerti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Weekly Review Modal ─────────────────────────────── */}
      <Modal
        visible={showWeeklyReview}
        transparent
        animationType="slide"
        onRequestClose={handleCloseWeeklyReview}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.weeklyModalContent]}>
            {weeklyLoading ? (
              <View style={styles.weeklyLoadingBox}>
                <ActivityIndicator size="large" color={Colors.textPrimary} />
                <Text style={styles.weeklyLoadingText}>Loading review...</Text>
              </View>
            ) : weeklySummary ? (
              <>
                <View style={styles.weeklyHeader}>
                  <Ionicons name="calendar" size={22} color={Colors.textPrimary} />
                  <Text style={styles.weeklyTitle}>Week in Review</Text>
                  <TouchableOpacity onPress={handleCloseWeeklyReview} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={24} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.weeklyDateRange}>
                  {formatDateHuman(weeklySummary.weekStart)} — {formatDateHuman(weeklySummary.weekEnd)}
                </Text>

                {/* BDS Score */}
                <View style={styles.weeklyBdsRow}>
                  <Text style={styles.weeklyBdsLabel}>Biological Defense Score</Text>
                  <Text style={[styles.weeklyBdsValue, { color: weeklySummary.bds >= 0.7 ? Colors.success : Colors.warning }]}>
                    {Math.round(weeklySummary.bds * 100)}%
                  </Text>
                </View>

                {/* Stats row */}
                <View style={styles.weeklyStatsRow}>
                  <View style={styles.weeklyStat}>
                    <Text style={styles.weeklyStatValue}>{weeklySummary.daysLogged}/7</Text>
                    <Text style={styles.weeklyStatLabel}>Days Active</Text>
                  </View>
                </View>

                {/* Pillar Breakdown */}
                <Text style={styles.weeklySectionLabel}>Pillar Breakdown</Text>
                <View style={styles.weeklyPillarList}>
                  {PILLAR_ORDER.map((key) => {
                    const p = weeklySummary.pillars[key];
                    if (!p) return null;
                    const isSupercharged = p.isSupercharged;
                    const color = isSupercharged ? Colors.supercharged : PILLAR_DOT_INFO[key].color;
                    const pct = Math.round(p.rate * 100);

                    return (
                      <View key={key} style={styles.weeklyPillarRow}>
                        <View style={[styles.weeklyPillarDot, { backgroundColor: color }]} />
                        <Text style={[styles.weeklyPillarName, { color }]} numberOfLines={1}>
                          {PILLAR_LABELS[key]}
                        </Text>
                        <Text style={[styles.weeklyPillarValue, { color }]}>
                          {pct}%
                          {isSupercharged ? ' ⚡' : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Focus Suggestion */}
                {weeklySummary.lowPillar && (
                  <View style={styles.weeklyFocusBox}>
                    <Ionicons name="bulb-outline" size={18} color={Colors.superchargedBadge} />
                    <Text style={styles.weeklyFocusText}>
                      {getWeeklyFocusSuggestion(weeklySummary.lowPillar)}
                    </Text>
                  </View>
                )}

                {/* Recent notes */}
                {weeklySummary.notes.length > 0 && (
                  <View style={styles.weeklyNotesSection}>
                    <Text style={styles.weeklySectionLabel}>Notes This Week</Text>
                    {weeklySummary.notes.map((note, i) => (
                      <Text key={i} style={styles.weeklyNoteItem}>• {note}</Text>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={handleCloseWeeklyReview}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCloseText}>Great!</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.weeklyErrorText}>Could not load weekly review.</Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Toggle Card Component (COMPACT) ─────────────────────────────────────────

const ToggleCard = React.memo(function ToggleCard({
  config,
  active,
  onPress,
  onInfoPress,
}: {
  config: ToggleCardConfig;
  active: boolean;
  onPress: () => void;
  onInfoPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        { transform: [{ scale: scaleAnim }] },
        active && styles.cardShadowActive,
      ]}
    >
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: active ? config.colorBg : Colors.bgCard,
            borderColor: active ? config.colorBorder : Colors.border,
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View style={styles.cardLeft}>
          <View
            style={[
              styles.cardIconBox,
              { backgroundColor: active ? config.color : '#F3F4F6' },
            ]}
          >
            <Ionicons
              name={active ? config.iconActive : config.icon}
              size={18}
              color={active ? Colors.textInverse : Colors.textMuted}
            />
          </View>
          <View style={styles.cardText}>
            <View style={styles.cardLabelRow}>
              <Text
                style={[
                  styles.cardLabel,
                  active && { color: config.color },
                ]}
                numberOfLines={1}
              >
                {config.label}
              </Text>
              <TouchableOpacity
                onPress={onInfoPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.5}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={active ? config.color : Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <Text
              style={[
                styles.cardSubtitle,
                active && { color: Colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {config.subtitle}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.toggleBadge,
            active && { backgroundColor: config.color, borderColor: config.color },
          ]}
        >
          {active ? (
            <Ionicons name="checkmark" size={16} color={Colors.textInverse} />
          ) : (
            <View style={styles.toggleEmpty} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerLeft: {
    gap: Spacing.sm,
    flex: 1,
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dateArrow: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateCenter: {
    alignItems: 'center',
    gap: 2,
    minWidth: 140,
  },
  greetingLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  dateText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  todayButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  gracePeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  gracePeriodText: {
    fontSize: 11,
    color: Colors.warning,
    fontWeight: '500',
    fontStyle: 'italic',
  },

  // ── BDS Container + Progress Dots ─────────────────────────────
  bdsContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  complianceBadge: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  complianceLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  complianceValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // ── Weekly Review Button ──────────────────────────────────────
  weeklyReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  weeklyReviewButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },

  // ── Section Title ────────────────────────────────────────────
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
    marginLeft: Spacing.xs,
  },

  // ── Toggle Cards (COMPACT) ────────────────────────────────────
  cardsContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  cardWrapper: {
    borderRadius: BorderRadius.xxl,
  },
  cardShadowActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1.5,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  cardSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  toggleBadge: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  toggleEmpty: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
  },

  // ── Note Input ────────────────────────────────────────────────
  noteCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  noteInput: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    minHeight: 60,
    padding: 0,
    lineHeight: 20,
  },
  noteSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.textPrimary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    alignSelf: 'flex-start',
  },
  noteSaveText: {
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
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
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
  modalNote: {
    fontSize: FontSize.sm,
    color: Colors.warning,
    lineHeight: 20,
    fontStyle: 'italic',
    backgroundColor: Colors.warning + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
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

  // ── Weekly Review Modal ──────────────────────────────────────
  weeklyModalContent: {
    maxHeight: '85%',
  },
  weeklyLoadingBox: {
    paddingVertical: Spacing.xxxxl,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  weeklyLoadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  weeklyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  weeklyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  weeklyDateRange: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  weeklyBdsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  weeklyBdsLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  weeklyBdsValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  weeklyStatsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  weeklyStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  weeklyStatValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  weeklyStatLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  weeklySectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  weeklyPillarList: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  weeklyPillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  weeklyPillarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  weeklyPillarName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  weeklyPillarValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  weeklyFocusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.superchargedBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.superchargedBorder,
    marginTop: Spacing.md,
  },
  weeklyFocusText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
    lineHeight: 20,
  },
  weeklyNotesSection: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  weeklyNoteItem: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  weeklyErrorText: {
    textAlign: 'center',
    color: Colors.danger,
    fontSize: FontSize.md,
    paddingVertical: Spacing.xxl,
  },
});
