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
} from '../services/db';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToggleCardConfig {
  key: 'muscle_bone' | 'fasting_nutrition' | 'brain_cognitive';
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  color: string;
  colorBg: string;
  colorBorder: string;
}

// Module-level constant — never recreated
const CARDS: ToggleCardConfig[] = [
  {
    key: 'muscle_bone',
    label: 'Muscle & Bone',
    subtitle: 'Strength training & impact work',
    icon: 'fitness-outline',
    iconActive: 'fitness',
    color: Colors.muscle,
    colorBg: Colors.muscleBg,
    colorBorder: Colors.muscleBorder,
  },
  {
    key: 'fasting_nutrition',
    label: 'Nutrient Window',
    subtitle: 'IF adherence & protein intake',
    icon: 'nutrition-outline',
    iconActive: 'nutrition',
    color: Colors.fasting,
    colorBg: Colors.fastingBg,
    colorBorder: Colors.fastingBorder,
  },
  {
    key: 'brain_cognitive',
    label: 'Brain & Nerve',
    subtitle: 'Cognitive stimulation & learning',
    icon: 'school-outline',
    iconActive: 'school',
    color: Colors.brain,
    colorBg: Colors.brainBg,
    colorBorder: Colors.brainBorder,
  },
];

// ─── Boundary Rules Info Text ────────────────────────────────────────────

const INFO_TEXT: Record<string, { title: string; yes: string; no: string; note?: string }> = {
  muscle_bone: {
    title: '💪 Muscle & Bone — Rule of Thumb',
    yes: 'Latihan beban mekanis (dumbbell rumah, push-up, squat) sampai otot terasa fatigue.\n\n— Atau —\nHari istirahat (rest) dengan target protein harian + kalsium (susu) terpenuhi untuk pemulihan sintesis otot.',
    no: 'Hanya duduk seharian atau sekadar jalan kaki santai di permukaan datar (tidak merangsang pertumbuhan tulang/otot).',
  },
  fasting_nutrition: {
    title: '🥗 Nutrient Window — Net Positive Rule',
    yes: 'Jendela puasa (Intermittent Fasting) terjaga dan nutrisi dasar aman.',
    no: 'Jendela puasa berantakan total (makan seharian tanpa henti) atau seharian penuh hanya makan makanan sampah tanpa protein.',
    note: 'Jika puasa & protein aman tapi ada khilaf makan gula sedikit, tetap klik YA. Wajib catat khilafnya di Quick Note!',
  },
  brain_cognitive: {
    title: '🧠 Brain & Nerve — Boundary',
    yes: 'Otak keluar dari mode autopilot.\nBelajar logika coding baru yang rumit, debat arsitektur sistem, atau membaca buku sastra/klasik yang butuh fokus tinggi.',
    no: 'Hanya melakukan kerjaan mekanis, copy-paste code tanpa berpikir, atau pasif scroll media sosial.',
  },
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
  const [toggles, setToggles] = useState({
    muscle_bone: 0,
    fasting_nutrition: 0,
    brain_cognitive: 0,
  });
  const [notes, setNotes] = useState('');
  const [compliance, setCompliance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [infoPillar, setInfoPillar] = useState<string | null>(null);

  const isToday = selectedDate === today;
  const isPastDate = selectedDate < today;

  // Load data for the selected date
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [log, rate] = await Promise.all([
          getLogByDate(selectedDate),
          getComplianceRate(7),
        ]);
        if (log) {
          setToggles({
            muscle_bone: log.muscle_bone,
            fasting_nutrition: log.fasting_nutrition,
            brain_cognitive: log.brain_cognitive,
          });
          setNotes(log.notes || '');
        } else {
          // Reset for empty dates
          setToggles({ muscle_bone: 0, fasting_nutrition: 0, brain_cognitive: 0 });
          setNotes('');
        }
        setCompliance(rate);
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
      return next > today ? prev : next; // Don't go beyond today
    });
  }, [today]);

  const goToToday = useCallback(() => {
    setSelectedDate(today);
  }, [today]);

  // Toggle handler
  const handleToggle = useCallback(
    async (field: ToggleCardConfig['key']) => {
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
          </View>

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
        </View>

        {/* ── Big Three Checklist ─────────────────────────────── */}
        <Text style={styles.sectionTitle}>Daily Essentials</Text>
        <View style={styles.cardsContainer}>
          {CARDS.map((card) => (
            <ToggleCard
              key={card.key}
              config={card}
              active={toggles[card.key] === 1}
              onPress={() => handleToggle(card.key)}
              onInfoPress={() => handleShowInfo(card.key)}
            />
          ))}
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
    </SafeAreaView>
  );
}

// ─── Toggle Card Component ──────────────────────────────────────────────────

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
              size={22}
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
                  size={18}
                  color={active ? config.color : Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <Text
              style={[
                styles.cardSubtitle,
                active && { color: Colors.textSecondary },
              ]}
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
            <Ionicons name="checkmark" size={18} color={Colors.textInverse} />
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
    paddingBottom: Spacing.xxl,
  },
  headerLeft: {
    gap: Spacing.sm,
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
    minWidth: 160,
  },
  greetingLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  dateText: {
    fontSize: FontSize.xl,
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
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
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

  // ── Toggle Cards ──────────────────────────────────────────────
  cardsContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  cardWrapper: {
    borderRadius: BorderRadius.xxxl,
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
    padding: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.xxxl,
    borderWidth: 1.5,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
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
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  toggleBadge: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  toggleEmpty: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.border,
  },

  // ── Note Input ────────────────────────────────────────────────
  noteCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxxl,
    padding: Spacing.xl,
    gap: Spacing.lg,
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
    fontSize: FontSize.md,
    minHeight: 70,
    padding: 0,
    lineHeight: 22,
  },
  noteSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.textPrimary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
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
});
