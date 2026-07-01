# Architecture Document — Longevity & Functional Health Tracker V2

## Overview

The Longevity Tracker is a **single-user, offline-first** React Native application built with the Expo managed workflow. It tracks **5 daily longevity pillars** using binary (Yes/No) toggles and computes a **Biological Defense Score (BDS)** with dynamic weekly targeting.

The entire app runs on the device with no server component. All data is stored locally in SQLite and never leaves the device.

---

## Architecture Philosophy

### 1. Offline-First, Synchronous Launch
The app loads all state from the local SQLite database on launch with zero background synchronization. No network requests, background polling loops, or cloud dependencies.

### 2. Binary Friction
Tracking friction is minimized through binary (Yes/No) toggles — no calorie counting, no complex forms. The psychological model uses **BDS** — a cumulative compliance percentage with **Supercharged ⚡** badges for overachievement (>100%).

### 3. User Flow Ordering
Toggle cards are ordered by natural daily routine: **Sleep (pagi) → Fasting (siang) → Muscle (sore) → VO₂ (sore) → Brain (kapan saja)**.

---

## The 5-Pillar System

| # | Pillar | Icon | Target | Overachieve |
|---|--------|------|--------|-------------|
| 1 | ☀️ Sleep & Circadian | `moon` | 7x/week | ❌ Capped at 100% |
| 2 | 🥗 Fasting & Real Food | `nutrition` | 7x/week | ❌ Capped at 100% |
| 3 | 🏋️ Muscle & Bone | `fitness` | 3x/week | ✅ Unlimited |
| 4 | 🫀 Mitochondria & VO₂ | `flame` | 2x/week | ✅ Unlimited |
| 5 | 🧠 Brain & Cognitive | `school` | 5x/week | ✅ Unlimited |

### Biological Defense Score (BDS)
BDS = Average of all 5 pillar percentages (each capped at 1.0), **aggregate capped at 100%**. Pillars that overachieve (>100%) show an amber-gold **Supercharged ⚡** badge.

---

## Component Tree & Data Flow

### Startup Sequence
```
index.ts → expo-router/entry
  → app/_layout.tsx
    → initDatabase() → SQLite (5 pillars + V1→V2 migration)
    → setupNotifications(21) → daily reminder
    → setupWeeklyReview(19) → Sunday weekly review
    → Tabs Navigator
      → app/index.tsx (Dashboard: 5 cards + weekly review modal)
      → app/analytics.tsx (Analytics: 5 bars + pill chart + info modals)
```

### Dashboard Data Flow
```
User taps toggle (one of 5)
  → optimistic UI update
  → toggleField(date, field) → SQLite
  → getComplianceRate(7) → refresh BDS badge
  → mini progress dots update

User taps "Week in Review"
  → getWeeklySummary() → ISO week data
  → Modal shows: BDS, days logged, pillar rates, focus suggestion
```

### Analytics Data Flow
```
Screen mounts / selectedDays changes
  → getBiologicalDefenseScore(selectedDays)
  → getPerPillarCompliance(selectedDays)
  → getDailyBreakdown(selectedDays)
  → Render: BDS card + 5 progress bars + pill indicator chart
```

---

## Database Layer (`services/db.ts`)

### Schema (5 pillars)
```sql
daily_logs (id, date UNIQUE, muscle_bone, vo2_heart, fasting_food,
            sleep_circadian, brain_cognitive, notes, created_at)
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `initDatabase()` | Open SQLite, create/migrate table, enable WAL |
| `getLogByDate(date)` | Single date lookup |
| `upsertLog(date, updates)` | Insert or update row (dynamic 5-pillar) |
| `toggleField(date, field)` | Read → flip 0↔1 → upsert |
| `getLogsInRange(s, e)` | Range query, date-ascending |
| `getBiologicalDefenseScore(n)` | Average of 5 rates, capped at 100% |
| `getPerPillarCompliance(n)` | Dynamic weekly targeting per pillar |
| `getDailyBreakdown(n)` | Per-day breakdown, zero-fills missing dates |
| `getWeeklySummary()` | ISO week (Mon–Sun) summary with rates from actual logs |

### Weekly Review (`getWeeklySummary()`)
- Queries ISO week (Monday→Sunday) using date math
- Calculates pillar rates DIRECTLY from ISO week logs (NOT sliding window)
- Returns: `daysLogged`, `bds`, per-pillar `{days, rate, isSupercharged}`, `topPillar`, `lowPillar`, focus suggestion, recent notes

### Dynamic Weekly Targeting
```
Muscle:   rate = actualDays / (weeks × 3)          → uncapped
VO₂:      rate = actualDays / (weeks × 2)          → uncapped
Brain:    rate = actualDays / (weeks × 5)          → uncapped
Fasting:  rate = min(actualDays / totalDays, 1)    → capped
Sleep:    rate = min(actualDays / totalDays, 1)    → capped
```

---

## UI Architecture

### Theming (`constants/theme.ts`)
- **Colors:** 5 pillar accent colors (purple, green, red, orange, cyan)
- **Supercharged:** Amber-gold `#D97706` (distinct from success green `#10B981`)
- **Pill indicators:** `pillInactive` gray for inactive daily circles

### Dashboard (`app/index.tsx`)
- **Compact cards:** Reduced padding (lg instead of xl), smaller icons (40px), tighter gaps
- **Progress dots:** 5 colored circles below BDS badge showing today's pillar status
- **Grace period:** Shows "Data baru — BDS akan akurat setelah 7 hari" for new users
- **Weekly review modal:** Full Mon–Sun summary with pillar breakdown, BDS, focus suggestion, notes

### Analytics (`app/analytics.tsx`)
- **BDS card:** Shield icon, percentage, progress bar (green ≥70%, amber <70%)
- **5 pillar bars:** Each bar is tappable → opens info modal with definition
- **Pill indicator chart:** 5 colored circles per day (filled=active, outline=inactive) — replaces old stacked bar chart for better readability
- **Legend:** 5 colors for Muscle, VO₂, Food, Sleep, Brain

### Notifications (`services/notifications.ts`)
- **Daily reminder (21:00):** Native OS scheduling, zero polling
- **Weekly review (Sunday 19:00):** `WEEKLY` trigger with `weekday: 1` (Sunday)
- Both use cancel-before-schedule pattern to prevent duplicates

---

## Performance

- `React.memo` on `ToggleCard`
- `useCallback` on all handlers
- Module-level consts (`CARDS`, `PERIODS`, `PILLARS`, `PILLAR_TARGETS`)
- WAL mode for concurrent DB reads/writes
- Indexed `date` column for range queries
- No charting/SVG libraries — pure React Native Views

---

## Constraints
- No cloud sync (100% offline, 100% private)
- No user authentication
- Single user per device
