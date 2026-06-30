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
Screen mounts or viewMode changes
  → loadData() → Promise.all([
       getComplianceRate(7),     // SQLite range query
       getComplianceRate(30),    // SQLite range query
       getDailyBreakdown(days)   // SQLite range query + date fill
     ])
  → setWeeklyRate / setMonthlyRate / setDailyData
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
- **Colors:** Dark theme inspired by GitHub Dark (#0D1117 base) with three accent colors for the Big Three (coral red, emerald green, teal)
- **Spacing:** 8px grid system (xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32)
- **FontSize:** Scale from xs=11 to xxxl=34
- **BorderRadius:** sm=6, md=10, lg=16, xl=20, full=9999

### Dashboard (`app/index.tsx`)

**ToggleCard Component** (`React.memo`-wrapped):
- Uses `Animated.Value` with `useRef` for press animation (scale: 1 → 0.97)
- `Animated.spring` with native driver for zero-JS-thread animations
- Optimistic UI update pattern: set state immediately, then async save to DB, revert on failure
- Visual states:
  - **Inactive:** Dark card background, muted border, gray icon
  - **Active:** Colored background tint, colored border, filled icon with checkmark

**Layout:**
```
┌─────────────────────────────────┐
│  TODAY'S CHECK-IN     Weekly    │
│  Wed, Jun 30           71%     │
├─────────────────────────────────┤
│  DAILY ESSENTIALS               │
│  ┌─────────────────────────┐    │
│  │ 💪 Muscle & Bone     ● │    │  ← active state
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ 🥗 Nutrient Window   ○ │    │  ← inactive state
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ 🧠 Brain & Nerve      ● │    │
│  └─────────────────────────┘    │
├─────────────────────────────────┤
│  QUICK NOTE                     │
│  ┌─────────────────────────┐    │
│  │ [textarea]              │    │
│  └─────────────────────────┘    │
│           [Save]                │
└─────────────────────────────────┘
```

### Analytics (`app/analytics.tsx`)

**Bar Chart Implementation:**
Pure React Native `View` components — no SVG/charting libraries. Each day is represented by a `dayBarsStack` (100px fixed height) containing up to three 33px segments colored by category. The `justifyContent: 'flex-end'` layout ensures bars grow from the bottom.

**State Management:**
- `viewMode` state ('7' | '30') triggers data reload via `useCallback` dependency
- Loading state shown with `ActivityIndicator` during data fetch
- Period toggle uses `TouchableOpacity` with active/inactive styles

---

## Performance Optimization Details

### Render Optimization
| Technique            | Location                          | Benefit                          |
|----------------------|-----------------------------------|----------------------------------|
| `React.memo`         | `ToggleCard`                      | Prevents re-render on prop stability |
| `useCallback`        | `handleToggle`, `handleSaveNote`, press handlers | Stable function references |
| `useMemo`            | `today` string                    | Avoids re-computation on re-render |
| Module-level const   | `CARDS` array                     | Zero allocation, never recreated |

### Database Optimization
| Technique            | Benefit                          |
|----------------------|----------------------------------|
| WAL mode             | Concurrent reads during writes   |
| Indexed `date` column| O(log n) range lookups           |
| Range-scoped queries | Prevents memory bloating from full scans |
| `getFirstAsync`      | Efficient single-row lookup      |

### Asset Optimization
- `@expo/vector-icons` only — no external PNG/JPEG images
- Dark theme reduces OLED power draw
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
