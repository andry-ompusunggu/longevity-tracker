# Longevity & Functional Health Tracker

A lightweight, offline-first React Native (Expo) mobile app for tracking daily longevity habits. Built to combat biological decline in old age — sarcopenia (muscle loss), osteopenia (bone density loss), and cognitive/nerve decline — through simple binary check-ins and cumulative compliance tracking.

> **Philosophy:** Minimum friction, maximum consistency. No calorie counting, no gram precision, no punitive streaks — just a daily Yes/No check-in on the three pillars of longevity, with positive psychology through percentage-based compliance.

---

## Features

### Dashboard — The Daily Execution Wheel
- **Big Three Checklist** — Three high-contrast toggle cards:
  1. **Muscle & Bone Stimulus** — Strength training & impact work defense
  2. **Nutrient Window & Protein** — Intermittent fasting adherence & metabolic health
  3. **Brain & Nerve Sharpness** — Cognitive stimulation & learning
- **Weekly Compliance Badge** — Cumulative percentage displayed prominently in the header
- **Quick Note** — Optional short text log (max 100 characters) with save button

### Analytics — The Engineer's Fuel
- **7-Day & 30-Day Compliance** — Summary cards with progress bars
- **Daily Breakdown** — Lightweight stacked bar chart (pure View-based, no heavy charting libraries)
- **Period Toggle** — Switch between 7-day and 30-day views

### Performance Optimizations
- **Offline-First** — SQLite local storage, zero background processes
- **Indexed Queries** — `date` column indexed for fast range lookups
- **Render Optimized** — `React.memo`, `useCallback`, `useMemo` throughout
- **Lightweight Assets** — `@expo/vector-icons` only, no heavy images or animations
- **Dark Theme** — AMOLED-friendly dark palette to save battery on OLED screens
- **Battery Friendly** — No complex looping animations or heavy graphical computation

---

## Tech Stack

| Layer        | Technology                          |
|-------------|--------------------------------------|
| Framework   | React Native with Expo (Managed)    |
| Routing     | Expo Router (file-based)            |
| Storage     | Expo-SQLite (WAL mode)              |
| Icons       | @expo/vector-icons (Ionicons)       |
| Language    | TypeScript (strict mode)            |
| Navigation  | Bottom Tab Navigator (2 tabs)       |

---

## Prerequisites

- **Node.js** >= 18 (tested with v20.20.2)
- **npm** or **pnpm** (tested with npm 10.8.2)
- **Expo Go** app installed on your Android/iOS device
- **VS Code** (or your preferred editor)

> **Note:** No Android Studio emulator required. All development runs via Metro Bundler on your laptop and executes physically on the device via Expo Go.

---

## Setup & Installation

### 1. Clone and install dependencies

```bash
cd longevity-tracker
npm install
```

### 2. Start the development server

```bash
npx expo start
```

### 3. Run on your device

- **Android:** Scan the QR code with the **Expo Go** app (available on Google Play Store)
- **iOS:** Scan the QR code with the **Camera** app → tap the notification banner
- Ensure your phone and laptop are on the same Wi-Fi network

### 4. (Optional) Run on web

```bash
npx expo start --web
```

> The web variant is available for quick prototyping, but the app is designed and optimized for mobile.

---

## Project Structure

```
longevity-tracker/
├── app/
│   ├── _layout.tsx       # Root layout — DB init, tab navigation
│   ├── index.tsx          # Dashboard — Big Three toggle cards + Quick Note
│   └── analytics.tsx      # Analytics — compliance rates + daily bar chart
├── services/
│   └── db.ts              # SQLite service — init, upsert, toggle, compliance
├── constants/
│   └── theme.ts           # Dark theme colors, spacing, typography
├── assets/                # App icons (placeholder)
├── app.json               # Expo configuration
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript strict mode config
├── index.ts               # Entry point (expo-router/entry)
└── ARCHITECTURE.md        # Architecture documentation
```

---

## Database Schema

Single table `daily_logs` in `longevity.db` (SQLite):

| Column             | Type    | Description                              |
|--------------------|---------|------------------------------------------|
| `id`               | INTEGER | Primary key, auto-increment              |
| `date`             | TEXT    | YYYY-MM-DD format, **UNIQUE, INDEXED**   |
| `muscle_bone`      | INTEGER | 0 or 1 — muscle & bone stimulation       |
| `fasting_nutrition`| INTEGER | 0 or 1 — intermittent fasting adherence   |
| `brain_cognitive`  | INTEGER | 0 or 1 — cognitive stimulation           |
| `notes`            | TEXT    | Optional short text log (max 100 chars)  |
| `created_at`       | DATETIME| Default: CURRENT_TIMESTAMP               |

**Compliance Formula:** `(Total Approved Actions / Number of Days × 3) × 100%`

---

## Usage Guide

### Daily Check-in
1. Open the app → **Dashboard** tab opens by default
2. Tap each of the **Big Three** cards to mark them as completed (✓)
3. The **Weekly Compliance %** updates instantly in the header
4. (Optional) Write a quick note and tap **Save**

### View Trends
1. Tap the **Analytics** tab at the bottom
2. View 7-Day and 30-Day compliance summary cards
3. Toggle between **7 Days** and **30 Days** to see daily breakdowns
4. Each day's bar shows which of the three pillars were completed

---

## Scripts

| Command               | Description                          |
|-----------------------|--------------------------------------|
| `npm start`           | Start Expo development server        |
| `npx expo start --android` | Start and open in Expo Go (Android) |
| `npx expo start --ios`     | Start and open in Expo Go (iOS)    |
| `npx expo start --web`     | Start and open in browser          |
| `npx tsc --noEmit`    | Run TypeScript type-checking         |

---

## Performance Targets

- **Cold start:** < 1 second on Infinix Note 50 Pro
- **Bundle size:** Optimized (no heavy charting libs, no PNG/JPG assets)
- **RAM usage:** Minimal — single SQLite connection, no background processes
- **Battery:** Dark theme reduces OLED power draw; no polling loops

---

## License

MIT
