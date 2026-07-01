# Longevity Tracker — V2 "The 5-Pillar System"

A minimalist, offline-first React Native app for tracking **5 daily longevity pillars**: Sleep & Circadian, Fasting & Real Food, Muscle & Bone, Mitochondria & VO₂, and Brain & Cognitive. Built with Expo and styled in a Modern Public Transit UI aesthetic.

## Features

- **5-Pillar Check-in** — Tap to toggle each of 5 pillars. Order follows natural daily flow: Sleep (morning) → Fasting (siang) → Muscle (sore) → VO₂ (sore) → Brain (kapan saja). Instant optimistic UI updates with async SQLite persistence.
- **Mini Progress Dots** — 5 colored dots next to the BDS badge showing today's completion status at a glance.
- **Biological Defense Score (BDS)** — Aggregate score from all 5 pillars, each with unique weekly targets. Muscle (3x), VO₂ (2x), Brain (5x) can **overachieve >100%** with a Supercharged ⚡ badge. Fasting & Sleep are capped at 100%.
- **Backdate Logging** — Navigate to past dates using arrow controls. A "Today" button jumps back to the current date.
- **Quick Notes** — Jot down how you're feeling each day. Saved locally with a single tap.
- **Rich Analytics** — View BDS + 5 horizontal progress bars with target descriptions and info definitions.
- **Pill Indicator Chart** — Daily breakdown shown as 5 colored circles per day (active = filled, inactive = outline) — much more readable than stacked bars.
- **Weekly Review** — Tap "Week in Review" on the dashboard to see Monday–Sunday summary: BDS, per-pillar breakdown, focus suggestion for the weakest pillar, and recent notes.
- **Weekly Notification** — Automatic notification Sunday 19:00 to remind you to check your weekly review.
- **Daily Reminder** — Automatic notification at 21:00. Uses native OS scheduling — zero background polling.
- **Info Modals** — ℹ️ button on each pillar shows clear definitions: "Klik YA jika..." / "Biarkan TIDAK jika..."
- **Database Export** — One-tap export of your SQLite database via the system share sheet.
- **Fully Offline** — Zero network requests. All data stays on your device.
- **Lightweight** — No charting libraries, no SVG, no heavy dependencies. Pure React Native views.

## Design

**Modern Public Transit** aesthetic with 5 transit-line accent colors:

| Pillar | Color | Target | Overachieve |
|--------|-------|--------|-------------|
| ☀️ Sleep & Circadian | Purple `#8B5CF6` | 7x/week | ❌ Capped |
| 🥗 Fasting & Real Food | Green `#10B981` | 7x/week | ❌ Capped |
| 🏋️ Muscle & Bone | Red `#EF4444` | 3x/week | ✅ >100% |
| 🫀 Mitochondria & VO₂ | Orange `#F97316` | 2x/week | ✅ >100% |
| 🧠 Brain & Cognitive | Cyan `#06B6D4` | 5x/week | ✅ >100% |

- **Supercharged ⚡** = Amber-gold (`#D97706`) progress bar + badge for Muscle/VO₂/Brain >100%
- **BDS ≥70%** = Green progress bar (`#10B981`)
- **BDS <70%** = Amber progress bar (`#F59E0B`)

## Tech Stack

| Layer        | Technology                      |
|-------------|---------------------------------|
| Framework   | React Native via Expo           |
| Routing     | Expo Router (file-based)        |
| Database    | SQLite via `expo-sqlite`        |
| Icons       | Ionicons via `@expo/vector-icons` |
| File Export | `expo-file-system` + `expo-sharing` |
| Notifications | `expo-notifications` (local only) |
| Language    | TypeScript (strict mode)        |

## Getting Started (Development)

```bash
npm install
npx expo start
```

## Production Build

```bash
# Build APK untuk testing
npx eas build --platform android --profile preview

# Build AAB untuk Google Play
npx eas build --platform android --profile production
```

> **Catatan:** Daily reminder & weekly review hanya aktif di development build / production build. Di Expo Go, reminder akan skip.

## Project Structure

```
longevity-tracker/
├── app/
│   ├── _layout.tsx         # Root layout + tab navigator
│   ├── index.tsx           # Dashboard (5 toggle cards + weekly review)
│   └── analytics.tsx       # Analytics (5 bars + pill chart + info modals)
├── constants/
│   └── theme.ts            # Design tokens (5 pillar colors, supercharged amber)
├── services/
│   ├── db.ts               # SQLite layer + BDS + weekly summary
│   └── notifications.ts    # Daily + weekly review scheduling
├── index.ts                # Entry point
├── app.json                # Expo configuration
└── package.json            # Dependencies
```

## Privacy

100% private. All data stays in local SQLite. No accounts, no cloud sync, no tracking.

## License

MIT
