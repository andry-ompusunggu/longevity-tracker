import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getLogByDate,
  getTodayString,
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
  color: string;
  colorBg: string;
  colorBorder: string;
}

// Module-level constant — no need for useMemo inside component
const CARDS: ToggleCardConfig[] = [
  {
    key: 'muscle_bone',
    label: 'Muscle & Bone',
    subtitle: 'Strength training & impact work',
    icon: 'fitness-outline',
    color: Colors.muscle,
    colorBg: Colors.muscleBg,
    colorBorder: Colors.muscleBorder,
  },
  {
    key: 'fasting_nutrition',
    label: 'Nutrient Window',
    subtitle: 'IF adherence & protein intake',
    icon: 'restaurant-outline',
    color: Colors.fasting,
    colorBg: Colors.fastingBg,
    colorBorder: Colors.fastingBorder,
  },
  {
    key: 'brain_cognitive',
    label: 'Brain & Nerve',
    subtitle: 'Cognitive stimulation & learning',
    icon: 'bulb-outline',
    color: Colors.brain,
    colorBg: Colors.brainBg,
    colorBorder: Colors.brainBorder,
  },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const today = useMemo(() => getTodayString(), []);
  const [toggles, setToggles] = useState({
    muscle_bone: 0,
    fasting_nutrition: 0,
    brain_cognitive: 0,
  });
  const [notes, setNotes] = useState('');
  const [compliance, setCompliance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Load today's data on mount
  useEffect(() => {
    (async () => {
      try {
        const [log, rate] = await Promise.all([
          getLogByDate(today),
          getComplianceRate(7),
        ]);
        if (log) {
          setToggles({
            muscle_bone: log.muscle_bone,
            fasting_nutrition: log.fasting_nutrition,
            brain_cognitive: log.brain_cognitive,
          });
          setNotes(log.notes || '');
        }
        setCompliance(rate);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [today]);

  // Toggle handler with instant UI update + async DB sync
  const handleToggle = useCallback(
    async (field: ToggleCardConfig['key']) => {
      // Optimistic UI update
      setToggles((prev) => ({
        ...prev,
        [field]: prev[field] === 1 ? 0 : 1,
      }));

      try {
        await toggleField(today, field);
        // Refresh compliance after toggle
        const rate = await getComplianceRate(7);
        setCompliance(rate);
      } catch (err) {
        // Revert on failure
        setToggles((prev) => ({
          ...prev,
          [field]: prev[field] === 1 ? 0 : 1,
        }));
        console.error('Toggle failed:', err);
      }
    },
    [today]
  );

  // Save notes handler
  const handleSaveNote = useCallback(async () => {
    const trimmed = notes.trim().slice(0, 100);
    try {
      await upsertLog(today, { notes: trimmed });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [notes, today]);

  // Display percentage
  const compliancePercent = Math.round(compliance * 100);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
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
            <Text style={styles.greeting}>Today's Check-in</Text>
            <Text style={styles.dateText}>{formatDateHuman(today)}</Text>
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
            />
          ))}
        </View>

        {/* ── Quick Note ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Note</Text>
        <View style={styles.noteContainer}>
          <TextInput
            style={styles.noteInput}
            placeholder="How are you feeling today? (max 100 chars)"
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
            activeOpacity={0.7}
          >
            <Ionicons name="save-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.noteSaveText}>Save</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Toggle Card Component ──────────────────────────────────────────────────

const ToggleCard = React.memo(function ToggleCard({
  config,
  active,
  onPress,
}: {
  config: ToggleCardConfig;
  active: boolean;
  onPress: () => void;
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
    <Animated.View style={[styles.cardWrapper, { transform: [{ scale: scaleAnim }] }]}>
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
              styles.cardIcon,
              {
                backgroundColor: active ? config.color : 'transparent',
                borderColor: config.color,
              },
            ]}
          >
            <Ionicons
              name={config.icon}
              size={22}
              color={active ? Colors.bg : config.color}
            />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardLabel, active && { color: config.color }]}>
              {config.label}
            </Text>
            <Text style={styles.cardSubtitle}>{config.subtitle}</Text>
          </View>
        </View>
        <View
          style={[
            styles.toggleDot,
            {
              backgroundColor: active ? config.color : Colors.textMuted,
            },
          ]}
        >
          {active && <Ionicons name="checkmark" size={16} color={Colors.bg} />}
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  headerLeft: {
    gap: Spacing.xs,
  },
  greeting: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dateText: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  complianceBadge: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    minWidth: 72,
  },
  complianceLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  complianceValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },

  // Section Title
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },

  // Cards
  cardsContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  cardWrapper: {
    borderRadius: BorderRadius.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  toggleDot: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Note Input
  noteContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  noteInput: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    minHeight: 60,
    padding: 0,
  },
  noteSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.bg,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noteSaveText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
