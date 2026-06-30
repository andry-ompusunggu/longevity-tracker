# Longevity Tracker

A minimalist, offline-first React Native app for tracking three daily longevity essentials: **Muscle & Bone**, **Nutrient Window**, and **Brain & Nerve**. Built with Expo and styled in a Modern Public Transit UI aesthetic.

## Features

- **Daily Check-in** — Tap to toggle each of the Big Three pillars. Instant optimistic UI updates with async SQLite persistence.
- **Backdate Logging** — Navigate to past dates using arrow controls to fill in missed days. A "Today" button jumps back to the current date.
- **Quick Notes** — Jot down how you're feeling each day. Saved locally with a single tap.
- **Compliance Tracking** — See your weekly compliance percentage at a glance on the dashboard.
- **Rich Analytics** — View your compliance trends over 7, 30, 60, 90, 180, or 365 days. Single main card clearly shows your selected period's rate with compact 7-day and 30-day reference stats.
- **Smart Bar Chart** — Clean day-by-day breakdown with auto-spaced labels (day names for short periods, date format for longer ranges). Horizontally scrollable for extended periods.
- **Daily Reminder** — Automatic notification at 21:00 (configurable) reminding you to do your check-in. Uses native OS scheduling (Android AlarmManager) — zero background polling, zero battery drain.
- **Database Export** — One-tap export of your SQLite database via the system share sheet. Copy to Files, email it, or send to your laptop for deeper analysis with any SQLite browser.
- **Fully Offline** — Zero network requests. All data stays on your device in SQLite.
- **Lightweight** — No charting libraries, no SVG, no heavy dependencies. Pure React Native views.

## Design

The UI follows a **Modern Public Transit** aesthetic: ultra-clean, monochromatic high-contrast palette with:

- Light gray canvas (`#F4F4F6`) with pure white card surfaces (`#FFFFFF`)
- Deep charcoal text (`#1A1A1A`) for maximum readability
- Highly rounded card corners (28px) with soft drop shadows
- Capsule-shaped buttons and inputs
- Thin geometric line icons (Ionicons)
- Three transit-line accent colors for the Big Three (red, green, teal)

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
# Install dependencies
npm install

# Start the Expo dev server
npx expo start

# Run on Android (Expo Go)
npx expo start --android

# Run on iOS (Expo Go)
npx expo start --ios
```

## Production Build

Untuk build APK/AAB produksi yang bisa di-install langsung ke HP tanpa Expo Go:

### Prasyarat
- Akun [Expo](https://expo.dev) (free)
- Sudah install `eas-cli`: `npm install -g eas-cli`
- Login: `npx eas login`

### Build APK (Android)

```bash
# Build APK untuk testing / side-load
npx eas build --platform android --profile preview

# Build AAB untuk upload ke Google Play Store
npx eas build --platform android --profile production
```

### Build Development Build (Notifications Aktif)

expo-notifications tidak berfungsi penuh di Expo Go sejak SDK 53. Untuk mengaktifkan daily reminder jam 21:00, buat **development build** kustom:

```bash
# Install dev client
npx expo install expo-dev-client

# Build development APK
npx eas build --platform android --profile development

# Install APK hasil build ke HP, lalu jalankan:
npx expo start --dev-client
```

> **Catatan:** Daily reminder hanya aktif di development build / production build. Di Expo Go, reminder akan skip dengan pesan info.

### EAS Build Profiles

Buat file `eas.json` di root project:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

## Project Structure

```
longevity-tracker/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout + tab navigator
│   ├── index.tsx           # Dashboard screen (with backdate support)
│   └── analytics.tsx       # Analytics screen (with export)
├── constants/
│   └── theme.ts            # Design tokens (colors, spacing, typography)
├── services/
│   ├── db.ts               # SQLite database layer + export path
│   └── notifications.ts    # Daily reminder scheduling (21:00)
├── index.ts                # Entry point
├── app.json                # Expo configuration
└── package.json            # Dependencies
```

## Privacy

100% private. All data is stored locally in SQLite and never leaves your device. No accounts, no cloud sync, no tracking. The export feature copies your database to a temporary file for sharing — you control where it goes.

## License

MIT
