# Architecture Document — Longevity & Functional Health Tracker

## Overview

The Longevity Tracker is a **single-user, offline-first** React Native application built with the Expo managed workflow. It follows a minimalist architecture optimized for low-end Android devices (target: Infinix Note 50 Pro, 8GB RAM) and a development machine running Linux Mint XFCE with limited RAM (8GB).

The entire app runs on the device with no server component. All data is stored locally in SQLite and never leaves the device.

---

## Architecture Philosophy

### 1. Offline-First, Synchronous Launch
The app loads all state from the local SQLite database on launch with zero background synchronization. There are no network requests, no background polling loops, and no cloud dependencies. This ensures instant startup and zero battery drain from background processes.

### 2. Binary Friction
Tracking friction is minimized through binary (Yes/No) toggles — no calorie counting, no gram precision, no complex forms. The psychological model uses **cumulative compliance percentage** instead of punitive streak counters to maintain positive reinforcement.

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
│   └── db.ts               # SQLite abstraction layer
├── constants/
│   └── theme.ts            # Design tokens (colors, spacing, typography)
├── index.ts                # Entry point: loads expo-router
├── app.json                # Expo configuration + plugins
├── package.json            # Dependency manifest
└── tsconfig.json           # TypeScript configuration
```

---

## Component Tree & Data Flow

### Startup Sequence
```
index.ts
  └─ imports expo-router/entry
       └─ app/_layout.tsx (RootLayout)
            ├─ initDatabase() → opens SQLite connection
            │   ├─ CREATE TABLE IF NOT EXISTS daily_logs
            │   └─ CREATE INDEX IF NOT EXISTS idx_daily_logs_date
            └─ Tabs Navigator
                 ├─ app/index.tsx (Dashboard)
                 └─ app/analytics.tsx (Analytics)
```

### Dashboard Data Flow
```
User taps toggle card
  → optimistic UI update (setToggles)
  → async toggleField(date, field) → SQLite UPDATE/INSERT
  → async getComplianceRate(7) → SQLite SELECT (range query)
  → setCompliance(rate) → re-render compliance badge

User types note + taps Save
  → async upsertLog(date, { notes }) → SQLite UPDATE/INSERT
```

### Analytics Data Flow
```
Screen mounts or selectedDays changes
  → loadData() → Promise.all([
       getComplianceRate(7),           // Weekly rate
       getComplianceRate(30),          // Monthly rate
       getComplianceRate(selectedDays), // Selected period rate
       getDailyBreakdown(selectedDays)  // Per-day breakdown
     ])
  → setWeeklyRate / setMonthlyRate / setSelectedRate / setDailyData
  → re-render summary cards + bar chart
```

---

## Database Layer (`services/db.ts`)

### Singleton Pattern
The database connection is cached as a module-level variable (`let db`). `initDatabase()` is called once in the root layout's `useEffect`. All subsequent operations use `getDb()` which throws if called before initialization.

### WAL Mode
Write-Ahead Logging is enabled via `PRAGMA journal_mode = WAL;` for better concurrent read performance — important since the Dashboard may read compliance data while also writing toggles.

### Index Strategy
A single index on `date` enables fast range queries for weekly/monthly compliance lookups. All data access is scoped to specific date ranges, preventing full table scans.

### Functions

| Function               | Purpose                                           |
|------------------------|---------------------------------------------------|
| `initDatabase()`       | Open connection, create table + index, enable WAL |
| `getLogByDate(date)`   | Single date lookup (used by toggle + dashboard)   |
| `upsertLog(date, ...)` | Insert new or update existing row                 |
| `toggleField(date, f)` | Read current value → flip 0↔1 → upsert           |
| `getLogsInRange(s, e)` | Range query with inclusive bounds, date-ascending |
| `getComplianceRate(n)` | Total approved / (days × 3), bounded to [0, 1]    |
| `getDailyBreakdown(n)` | Per-day breakdown, fills missing dates with zeros  |

### Zero-Fill Strategy
`getDailyBreakdown()` generates all dates in the requested range using JavaScript Date arithmetic, then maps each date against the SQLite results using a `Map<string, DailyLog>` for O(1) lookup. Missing dates receive a compliance of 0 — this correctly handles days where the user didn't open the app.

---

## UI Architecture

### Theming (`constants/theme.ts`)
All design tokens are centralized in a single constants file:
- **Colors:** Light monochromatic theme inspired by modern transit UI (#F4F4F6 canvas, #FFFFFF cards, #1A1A1A text). Three accent colors for the Big Three (coral red, emerald green, teal cyan)
- **Spacing:** 4px grid system (xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32, xxxxl=40)
- **FontSize:** Scale from xs=12 to xxxl=40
- **BorderRadius:** sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=28, xxxxl=32, full=9999

### Business Logic — Per-Pillar Compliance Formula

The app uses distinct formulas for each pillar on the Analytics page:

| Pillar | Formula | Max |
|--------|---------|-----|
| **Muscle & Bone** | `active_days / (ceil(period/7) × 3)` | Can exceed 100% (overachievement) |
| **Nutrient Window** | `active_days / period_days` | Capped at 100% |
| **Brain & Nerve** | `active_days / period_days` | Capped at 100% |

Muscle uses 3 days/week as the sweet spot target. If the user exceeds this (e.g., 4 days = 133%), the analytics card shows a gold border with a "Bonus" badge.

### Boundary Rules (Rule of Thumb)

Each Daily Essential card on the Dashboard has an info icon (ℹ️) that opens a modal with validation criteria:

**💪 Muscle & Bone**
- **Klik YA:** Weight training (dumbbell, push-up, squat) to fatigue, OR rest day with protein + calcium intake met
- **Biarkan TIDAK:** Sitting idle or light flat walking (no bone/muscle stimulus)

**🥗 Nutrient Window (Net Positive Rule)**
- **Klik YA:** IF window maintained + basic nutrition secure. If there's a small sugar slip, still click YES but log it in Quick Note
- **Biarkan TIDAK:** IF totally broken (eating all day) or full day of junk food with no protein

**🧠 Brain & Nerve**
- **Klik YA:** Brain exits autopilot — learning complex new coding logic, system architecture debates, or reading demanding literature
- **Biarkan TIDAK:** Mechanical work, copy-paste coding without thought, or passive social media scrolling

---

### Dashboard (`app/index.tsx`)

**Backdate Support:**
The dashboard supports logging for past dates via left/right arrow navigation. When viewing a past date:
- The greeting changes from "Good Morning/Afternoon/Evening" to "Viewing"
- A "Today" button appears to jump back to the current date
- All toggle and notes operations save to the selected date, not just today
- The weekly compliance badge always shows the current 7-day rate from today

**ToggleCard Component** (`React.memo`-wrapped):
- Uses `Animated.Value` with `useRef` for press animation (scale: 1 → 0.97)
- `Animated.spring` with native driver for zero-JS-thread animations
- Optimistic UI update pattern: set state immediately, then async save to DB, revert on failure
- Icons: `fitness` (muscle), `nutrition` (bowl of healthy food), `school` (graduation cap for learning)
- Visual states:
  - **Inactive:** White card background, muted border, gray icon
  - **Active:** Colored background tint, colored border, filled icon with checkmark

**Layout:**
```
┌───────────────────────────────────────┐
│  ◀  GOOD AFTERNOON  ▶     Weekly    │
│  Wed, Jun 30               71%     │
│  [Today] ← only when viewing past   │
├───────────────────────────────────────┤
│  DAILY ESSENTIALS                    │
│  ┌───────────────────────────────┐   │
│  │ 🏋️ Muscle & Bone       ✅    │   │  ← active (colored tint)
│  │ Strength training/impact      │   │
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │ 🥗 Nutrient Window      ○    │   │  ← inactive (white)
│  │ IF adherence & protein       │   │
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │ 🎓 Brain & Nerve       ✅    │   │
│  │ Cognitive stimulation        │   │
│  └───────────────────────────────┘   │
├───────────────────────────────────────┤
│  QUICK NOTE                           │
│  ┌───────────────────────────────┐   │
│  │ [How are you feeling today?]  │   │
│  │                               │   │
│  └───────────────────────────────┘   │
│        [ ██ Save Note ██ ]           │ ← capsule-shaped black button
└───────────────────────────────────────┘
```

### Analytics (`app/analytics.tsx`)

**Period Selector:**
Horizontally scrollable capsule-shaped toggle with 6 presets: 7D, 30D, 60D, 90D, 6M, 1Y. The active period has a solid black fill with white text.

**Main Compliance Card:**
A single large card prominently displays the selected period's compliance percentage with a progress bar. Below it, a compact context row shows 7-day and 30-day rates as small inline stats, giving quick reference without visual clutter.

**Bar Chart Implementation:**
Pure React Native `View` components — no SVG/charting libraries. Each day is represented by a `dayBarsStack` (100px fixed height for short periods, 80px for long periods) containing up to three 33px segments colored by category. The `justifyContent: 'flex-end'` layout ensures bars grow from the bottom.

**Smart Label Strategy:**
- For ≤7 days: every day label is shown
- For 8–30 days: labels shown at intervals of ~8 days
- For 31–60 days: labels shown at intervals of ~7
- For 61–90 days: labels shown at intervals of ~6
- For 90+ days: labels shown at intervals resulting in ~6 total
- Labels switch from day names ("Mon") to date format ("6/15") for 60+ day ranges

**Scrollable Chart:**
For periods longer than 14 days, the bar chart becomes horizontally scrollable with fixed-width columns, keeping individual bars visible and properly spaced.

**Database Export:**
An "Export Database" button at the bottom of the screen copies the SQLite file to the app cache and opens the system share sheet. The file can be saved to Files, emailed, AirDropped, or sent to a laptop for external analysis with any SQLite browser.

**State Management:**
- `selectedDays` state (number) triggers data reload via `useCallback` dependency
- Loading state shown with `ActivityIndicator` during data fetch
- Period selector uses `TouchableOpacity` with active/inactive styles

---

## Performance Optimization Details

### Render Optimization
| Technique            | Location                          | Benefit                          |
|----------------------|-----------------------------------|----------------------------------|
| `React.memo`         | `ToggleCard`                      | Prevents re-render on prop stability |
| `useCallback`        | `handleToggle`, `handleSaveNote`, press handlers, `loadData` | Stable function references |
| `useMemo`            | `today` string, `greeting` string | Avoids re-computation on re-render |
| Module-level const   | `CARDS` array, `PERIODS` array    | Zero allocation, never recreated |

### Database Optimization
| Technique            | Benefit                          |
|----------------------|----------------------------------|
| WAL mode             | Concurrent reads during writes   |
| Indexed `date` column| O(log n) range lookups           |
| Range-scoped queries | Prevents memory bloating from full scans |
| `getFirstAsync`      | Efficient single-row lookup      |

### Asset Optimization
- `@expo/vector-icons` only — no external PNG/JPEG images
- Light theme with pure white surfaces and minimal shadows reduces GPU overdraw
- No complex animations — only native-driven spring transitions
- No background threads or polling loops

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
├── expo-status-bar (status bar theming)
├── @expo/vector-icons (Ionicons)
└── react-native (UI framework)
```

---

## Future Architecture Considerations

### Potential Extensions
1. **Data Export** — Add a share/export feature to dump SQLite as JSON (pure client-side, no server)
2. **Notifications** — Add expo-notifications for daily reminder without background polling
3. **Backup** — File-based SQLite export to device storage or iCloud/Google Drive
4. **Widget** — Android home screen widget showing today's check-in status

### Constraints
- No cloud sync (by design — ensures 100% privacy and offline operation)
- No user authentication
- No multi-device support
- Single user per device
