# Architecture Document — Longevity & Functional Health Tracker

## Overview

The Longevity Tracker is a **single-user, offline-first** React Native application built with the Expo managed workflow. It follows a minimalist architecture optimized for low-end Android devices (target: Infinix Note 50 Pro, 8GB RAM) and a development machine running Linux Mint XFCE with limited RAM (8GB).

The entire app runs on the device with no server component. All data is stored locally in SQLite and never leaves the device.

---

## Architecture Philosophy

### 1. Offline-First, Synchronous Launch
The app loads all state from the local SQLite database on launch with zero background synchronization. There are no network requests, no background polling loops, and no cloud dependencies. This ensures instant startup and zero battery drain from background processes.

### 2. Binary Friction
Tracking friction is minimized through binary (Yes/No) toggles — no calorie counting, no gram precision, no complex forms. The psychological model uses **Biological Defense Score (BDS)** — a cumulative compliance percentage averaged across 5 pillars — instead of punitive streak counters to maintain positive reinforcement.

### 3. Render Performance
The component tree is optimized with `React.memo`, `useCallback`, and `useMemo` to prevent unnecessary re-renders, particularly on the toggle cards which update on every user interaction.

---

## Directory Structure

```
longevity-tracker/          # Expo project root
├── app/                    # Expo Router — file-based routing
│   ├── _layout.tsx         # Root layout: DB init → tab navigator
│   ├── index.tsx           # Dashboard screen (route: /)
│   └── analytics.tsx       # Analytics screen (route: /analytics)
├── services/
│   ├── db.ts               # SQLite abstraction layer (V2: 5 pillars)
│   └── notifications.ts    # Daily reminder at 21:00 via expo-notifications
├── constants/
│   └── theme.ts            # Design tokens (colors, spacing, typography)
├── index.ts                # Entry point: loads expo-router
├── app.json                # Expo configuration + plugins
├── package.json            # Dependency manifest
└── tsconfig.json           # TypeScript configuration
```

---

## The 5-Pillar System (V2)

The app was upgraded from 3 pillars to **5 pillars** covering all major biological defense mechanisms:

| # | Pillar | Icon | Target | Overachievement |
|---|--------|------|--------|-----------------|
| 1 | 🏋️ **Muscle & Bone** | `fitness` | 3x/week | ✅ Can exceed 100% |
| 2 | 🫀 **Mitochondria & VO₂** | `flame` | 2x/week | ✅ Can exceed 100% |
| 3 | 🥗 **Fasting & Real Food** | `nutrition` | 7x/week | ❌ Capped at 100% |
| 4 | ☀️ **Sleep & Circadian** | `moon` | 7x/week | ❌ Capped at 100% |
| 5 | 🧠 **Brain & Cognitive** | `school` | 5x/week | ✅ Can exceed 100% |

### Biological Defense Score (BDS)
BDS = Average of all 5 pillar percentages, **capped at 100%** for the aggregate score. Individual pillars that reach >100% show a **Supercharged ⚡** badge.

---

## Component Tree & Data Flow

### Startup Sequence
```
index.ts
  └─ imports expo-router/entry
       └─ app/_layout.tsx (RootLayout)
            ├─ initDatabase() → opens SQLite connection
            │   ├─ CREATE TABLE IF NOT EXISTS daily_logs (5 pillars)
            │   ├─ V1→V2 migration: adds vo2_heart, sleep_circadian, fasting_food
            │   └─ CREATE INDEX IF NOT EXISTS idx_daily_logs_date
            ├─ setupNotifications(21) → native OS scheduler
            │   ├─ Create Android notification channel
            │   ├─ Request POST_NOTIFICATIONS permission (Android 13+)
            │   └─ Schedule DAILY trigger at 21:00 — zero background polling
            └─ Tabs Navigator
                 ├─ app/index.tsx (Dashboard — 5 toggle cards)
                 └─ app/analytics.tsx (Analytics — 5 progress bars + BDS)
```

### Dashboard Data Flow
```
User taps toggle card (one of 5 pillars)
  → optimistic UI update (setToggles)
  → async toggleField(date, field) → SQLite UPDATE/INSERT
  → async getBiologicalDefenseScore(7) → SQLite SELECT (5-pillar average)
  → setCompliance(rate) → re-render compliance badge

User types note + taps Save
  → async upsertLog(date, { notes }) → SQLite UPDATE/INSERT
```

### Analytics Data Flow
```
Screen mounts or selectedDays changes
  → loadData() → Promise.all([
       getBiologicalDefenseScore(selectedDays),  // BDS for selected period
       getBiologicalDefenseScore(7),              // Weekly BDS
       getBiologicalDefenseScore(30),             // Monthly BDS
       getPerPillarCompliance(selectedDays),      // Per-pillar rates
       getDailyBreakdown(selectedDays)            // Per-day breakdown
     ])
  → setBdsRate / setWeeklyBds / setMonthlyBds / setPillarRates / setDailyData
  → re-render BDS card + 5 progress bars + bar chart
```

---

## Database Layer (`services/db.ts`)

### Singleton Pattern
The database connection is cached as a module-level variable (`let db`). `initDatabase()` is called once in the root layout's `useEffect`. All subsequent operations use `getDb()` which throws if called before initialization.

### Schema Migration (V1 → V2)
On first launch with V2 code, the app detects old schema (presence of `fasting_nutrition` column) and runs:
1. `ALTER TABLE` to add `vo2_heart`, `sleep_circadian`, `fasting_food` columns
2. `UPDATE` to copy data from `fasting_nutrition` → `fasting_food`
3. Fresh installs create the full 5-pillar table directly

### WAL Mode
Write-Ahead Logging is enabled via `PRAGMA journal_mode = WAL;` for better concurrent read performance — important since the Dashboard may read compliance data while also writing toggles.

### Index Strategy
A single index on `date` enables fast range queries for weekly/monthly compliance lookups. All data access is scoped to specific date ranges, preventing full table scans.

### Dynamic Weekly Targeting (PILLAR_TARGETS)

| Pillar | Target | Type | Math |
|--------|--------|------|------|
| `muscle_bone` | 3x/week | Unbounded | `actual / (weeks × 3)` |
| `vo2_heart` | 2x/week | Unbounded | `actual / (weeks × 2)` |
| `fasting_food` | 7x/week | Capped 100% | `min(actual / days, 1)` |
| `sleep_circadian` | 7x/week | Capped 100% | `min(actual / days, 1)` |
| `brain_cognitive` | 5x/week | Unbounded | `actual / (weeks × 5)` |

### Functions

| Function | Purpose |
|----------|---------|
| `initDatabase()` | Open connection, migrate/create table + index, enable WAL |
| `getLogByDate(date)` | Single date lookup (used by toggle + dashboard) |
| `upsertLog(date, updates)` | Insert new or update existing row (dynamic 5-pillar) |
| `toggleField(date, field)` | Read current value → flip 0↔1 → upsert |
| `getLogsInRange(s, e)` | Range query with inclusive bounds, date-ascending |
| `getBiologicalDefenseScore(n)` | Average of 5 pillar percentages, capped at 100% |
| `getComplianceRate(n)` | Alias for BDS (backward compat) |
| `getPerPillarCompliance(n)` | Per-pillar rates with dynamic weekly targets |
| `getDailyBreakdown(n)` | Per-day breakdown, fills missing dates with zeros |

### Zero-Fill Strategy
`getDailyBreakdown()` generates all dates in the requested range using JavaScript Date arithmetic, then maps each date against the SQLite results using a `Map<string, DailyLog>` for O(1) lookup. Missing dates receive a compliance of 0 — this correctly handles days where the user didn't open the app.

---

## UI Architecture

### Theming (`constants/theme.ts`)
All design tokens are centralized in a single constants file:
- **Colors:** Light monochromatic theme inspired by modern transit UI (#F4F4F6 canvas, #FFFFFF cards, #1A1A1A text). Five accent colors for the 5 pillars (red, orange, green, purple, cyan). Supercharged green (#22C55E) for overachievement.
- **Spacing:** 4px grid system (xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32, xxxxl=40)
- **FontSize:** Scale from xs=12 to xxxl=40
- **BorderRadius:** sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=28, xxxxl=32, full=9999

### Business Logic — Dynamic Weekly Compliance Math

Each pillar has a unique weekly target ratio, enabling "Overachieve" (>100%) status:

| Pillar | Target | Formula | Max |
|--------|--------|---------|-----|
| **🏋️ Muscle & Bone** | 3x/week | `(Days / 3) × 100` | >100% ✅ |
| **🫀 Mitochondria & VO₂** | 2x/week | `(Days / 2) × 100` | >100% ✅ |
| **🥗 Fasting & Real Food** | 7x/week | `(Days / 7) × 100` | 100% capped |
| **☀️ Sleep & Circadian** | 7x/week | `(Days / 7) × 100` | 100% capped |
| **🧠 Brain & Cognitive** | 5x/week | `(Days / 5) × 100` | >100% ✅ |

**Biological Defense Score (BDS)** = Average of all 5 pillar percentages (aggregate capped at 100%, individual may exceed).

### Check-in Definitions (Info Modals)

Each toggle card on the Dashboard has an ℹ️ info button with these definitions:

- **🏋️ Muscle & Bone:** 1 = Latihan dumbbell (Mechanical tension) / asupan protein pemulihan.
- **🫀 Mitochondria (VO₂):** 1 = Latihan HIIT/Burpees (ngos-ngosan maksimal) 5-10 menit.
- **🥗 Fasting & Food:** 1 = Puasa 17:7 terjaga & High-protein meal prep.
- **☀️ Sleep & Circadian:** 1 = Cahaya matahari pagi + No blue light sebelum tidur.
- **🧠 Brain & Cognitive:** 1 = Kerja deep-focus (coding/baca buku klasik) tanpa distraksi.

---

### Dashboard (`app/index.tsx`)

**5 Toggle Cards:**
1. 🏋️ **Muscle & Bone** (red) — `fitness` icon
2. 🫀 **Mitochondria & VO₂** (orange) — `flame` icon
3. 🥗 **Fasting & Real Food** (green) — `nutrition` icon
4. ☀️ **Sleep & Circadian** (purple) — `moon` icon
5. 🧠 **Brain & Cognitive** (cyan) — `school` icon

**Backdate Support:**
The dashboard supports logging for past dates via left/right arrow navigation. When viewing a past date:
- The greeting changes from "Good Morning/Afternoon/Evening" to "Viewing"
- A "Today" button appears to jump back to the current date
- All toggle and notes operations save to the selected date, not just today
- The weekly BDS badge always shows the current 7-day score from today

**ToggleCard Component** (`React.memo`-wrapped):
- Uses `Animated.Value` with `useRef` for press animation (scale: 1 → 0.97)
- `Animated.spring` with native driver for zero-JS-thread animations
- Optimistic UI update pattern: set state immediately, then async save to DB, revert on failure
- Visual states:
  - **Inactive:** White card background, muted border, gray icon
  - **Active:** Colored background tint, colored border, filled icon with checkmark

**Layout:**
```
┌───────────────────────────────────────┐
│  ◀  GOOD AFTERNOON  ▶   BDS 71%     │
│  Wed, Jun 30                          │
│  [Today] ← only when viewing past     │
├───────────────────────────────────────┤
│  DAILY ESSENTIALS (5 Pillars)         │
│  ┌───────────────────────────────┐   │
│  │ 🏋️ Muscle & Bone       ✅    │   │
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │ 🫀 Mitochondria & VO₂   ✅    │   │
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │ 🥗 Fasting & Real Food  ○    │   │
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │ ☀️ Sleep & Circadian    ✅    │   │
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │ 🧠 Brain & Cognitive    ✅    │   │
│  └───────────────────────────────┘   │
├───────────────────────────────────────┤
│  QUICK NOTE                           │
│  ┌───────────────────────────────┐   │
│  │ [How are you feeling today?]  │   │
│  └───────────────────────────────┘   │
│        [ ██ Save Note ██ ]           │
└───────────────────────────────────────┘
```

### Analytics (`app/analytics.tsx`)

**Biological Defense Score (BDS) Card:**
The main card prominently displays the BDS with a shield icon. Progress bar turns green (supercharged) at ≥70%, amber below.

**5-Pillar Progress Bars:**
Horizontal progress bars for each pillar, each showing:
- Icon + label + target description (e.g., "3x/week")
- Percentage value
- Progress bar fill (standard color or vibrant green if supercharged)
- **Supercharged ⚡ badge** — appears on Muscle, VO₂, or Brain when >100%

**Period Selector:**
Horizontally scrollable capsule-shaped toggle with 6 presets: 7D, 30D, 60D, 90D, 6M, 1Y.

**Bar Chart (Daily Breakdown):**
Pure React Native `View` components — no SVG/charting libraries. Each day shows up to 5 colored segments (20px each = 100px total). Stacked from bottom with `justifyContent: 'flex-end'`.

**Smart Label Strategy:**
- ≤7 days: every day label shown
- Longer periods: spaced proportionally
- Labels switch from day names to month/day format at 60+ days

**Database Export:**
One-tap export of SQLite database via system share sheet.

---

## Performance Optimization Details

### Render Optimization
| Technique | Location | Benefit |
|-----------|----------|---------|
| `React.memo` | `ToggleCard` | Prevents re-render on prop stability |
| `useCallback` | `handleToggle`, `handleSaveNote`, press handlers, `loadData` | Stable function references |
| `useMemo` | `today` string, `greeting` string | Avoids re-computation on re-render |
| Module-level const | `CARDS` array, `PERIODS` array, `PILLARS` array | Zero allocation, never recreated |

### Database Optimization
| Technique | Benefit |
|-----------|---------|
| WAL mode | Concurrent reads during writes |
| Indexed `date` column | O(log n) range lookups |
| Range-scoped queries | Prevents memory bloating from full scans |
| `getFirstAsync` | Efficient single-row lookup |

### Asset Optimization
- `@expo/vector-icons` only — no external PNG/JPEG images
- Light theme with pure white surfaces and minimal shadows reduces GPU overdraw
- No complex animations — only native-driven spring transitions
- No background threads or polling loops

### Notification Strategy
- Uses Android `AlarmManager` / iOS `UNUserNotificationCenter` — the OS handles the trigger natively
- `scheduleNotificationAsync` with `DAILY` trigger type — no JavaScript timers or background tasks
- Permission requested gracefully on Android 13+ via `requestPermissionsAsync()`
- If permission denied, reminder simply doesn't schedule — no app crash or repeated prompt
- Cancel-before-schedule pattern prevents duplicate notifications across app restarts

---

## Dependency Map

```
expo (managed workflow)
├── expo-router (file-based routing)
│   └── react-native-gesture-handler
│   └── react-native-reanimated
│   └── react-native-screens
│   └── react-native-safe-area-context
│   └── expo-linking
│   └── expo-constants
├── expo-sqlite (local database)
├── expo-notifications (local scheduling — no server)
├── expo-status-bar (status bar theming)
├── @expo/vector-icons (Ionicons)
└── react-native (UI framework)
```

---

## Future Architecture Considerations

### Potential Extensions
1. **Data Export as JSON** — Add JSON export for easy spreadsheet analysis
2. **Notifications toggle** — Add UI toggle in settings to enable/disable the daily reminder
3. **Backup** — File-based SQLite export to device storage or iCloud/Google Drive
4. **Widget** — Android home screen widget showing today's check-in status
5. **Trend lines** — Line chart showing BDS trajectory over time

### Constraints
- No cloud sync (by design — ensures 100% privacy and offline operation)
- No user authentication
- No multi-device support
- Single user per device
