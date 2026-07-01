import * as SQLite from 'expo-sqlite';

export interface DailyLog {
  id?: number;
  date: string; // YYYY-MM-DD
  muscle_bone: number; // 0 or 1
  vo2_heart: number; // 0 or 1
  fasting_food: number; // 0 or 1
  sleep_circadian: number; // 0 or 1
  brain_cognitive: number; // 0 or 1
  notes: string;
  created_at?: string;
}

type PillarKey = 'muscle_bone' | 'vo2_heart' | 'fasting_food' | 'sleep_circadian' | 'brain_cognitive';

/**
 * Weekly target configuration for each pillar.
 * Pillars with noCap: true can exceed 100% (overachievement).
 */
const PILLAR_TARGETS: Record<PillarKey, { perWeek: number; noCap: boolean }> = {
  muscle_bone: { perWeek: 3, noCap: true },
  vo2_heart: { perWeek: 2, noCap: true },
  fasting_food: { perWeek: 7, noCap: false },
  sleep_circadian: { perWeek: 7, noCap: false },
  brain_cognitive: { perWeek: 5, noCap: true },
};

const ALL_PILLARS = Object.keys(PILLAR_TARGETS) as PillarKey[];

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize the database connection and create/migrate the table.
 * Must be called before any other db operations.
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('longevity.db');

  // Enable WAL mode for better concurrent read performance
  await db.execAsync('PRAGMA journal_mode = WAL;');

  // Check if old schema (3-pillar) exists and migrate
  const tableInfo = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM pragma_table_info('daily_logs') WHERE name = 'fasting_nutrition'"
  );
  const isOldSchema = tableInfo.length > 0;

  if (isOldSchema) {
    // V1 → V2 migration: add new columns, map fasting_nutrition → fasting_food
    await db.execAsync(`
      ALTER TABLE daily_logs ADD COLUMN vo2_heart INTEGER NOT NULL DEFAULT 0 CHECK(vo2_heart IN (0, 1));
      ALTER TABLE daily_logs ADD COLUMN sleep_circadian INTEGER NOT NULL DEFAULT 0 CHECK(sleep_circadian IN (0, 1));
      ALTER TABLE daily_logs ADD COLUMN fasting_food INTEGER NOT NULL DEFAULT 0 CHECK(fasting_food IN (0, 1));
    `);
    // Copy data from fasting_nutrition → fasting_food
    await db.execAsync(
      `UPDATE daily_logs SET fasting_food = fasting_nutrition;`
    );
    // SQLite can't drop columns easily, so we keep fasting_nutrition but ignore it
    console.log('✅ Migrated schema V1 → V2 (3 pillars → 5 pillars)');
  } else {
    // Fresh install — create table with 5 pillars
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS daily_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        muscle_bone INTEGER NOT NULL DEFAULT 0 CHECK(muscle_bone IN (0, 1)),
        vo2_heart INTEGER NOT NULL DEFAULT 0 CHECK(vo2_heart IN (0, 1)),
        fasting_food INTEGER NOT NULL DEFAULT 0 CHECK(fasting_food IN (0, 1)),
        sleep_circadian INTEGER NOT NULL DEFAULT 0 CHECK(sleep_circadian IN (0, 1)),
        brain_cognitive INTEGER NOT NULL DEFAULT 0 CHECK(brain_cognitive IN (0, 1)),
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Ensure index exists
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(date);
  `);

  return db;
}

/**
 * Get the database instance. Throws if not initialized.
 */
function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Get a log entry for a specific date.
 */
export async function getLogByDate(date: string): Promise<DailyLog | null> {
  const database = getDb();
  const result = await database.getFirstAsync<DailyLog>(
    'SELECT * FROM daily_logs WHERE date = ?',
    date
  );
  return result ?? null;
}

/**
 * Insert or update (upsert) a log entry for a specific date.
 * If a row with the given date exists, updates it; otherwise inserts a new row.
 */
export async function upsertLog(
  date: string,
  updates: Partial<Pick<DailyLog, 'muscle_bone' | 'vo2_heart' | 'fasting_food' | 'sleep_circadian' | 'brain_cognitive' | 'notes'>>
): Promise<void> {
  const database = getDb();

  // First, try to get existing row
  const existing = await getLogByDate(date);

  if (existing) {
    // Build SET clause dynamically
    const fields: string[] = [];
    const values: any[] = [];

    for (const pillar of ALL_PILLARS) {
      const val = updates[pillar] ?? existing[pillar];
      fields.push(`${pillar} = ?`);
      values.push(val);
    }

    const notes = updates.notes !== undefined ? updates.notes : existing.notes;
    fields.push('notes = ?');
    values.push(notes);
    values.push(date);

    await database.runAsync(
      `UPDATE daily_logs SET ${fields.join(', ')} WHERE date = ?`,
      ...values
    );
  } else {
    // Insert new row
    const pillars = ALL_PILLARS.map((p) => updates[p] ?? 0);
    const placeholders = ALL_PILLARS.map(() => '?').join(', ');

    await database.runAsync(
      `INSERT INTO daily_logs (date, ${ALL_PILLARS.join(', ')}, notes) VALUES (?, ${placeholders}, ?)`,
      date,
      ...pillars,
      updates.notes ?? ''
    );
  }
}

/**
 * Toggle a single column value (0↔1) for a given date.
 * Returns the new value.
 */
export async function toggleField(
  date: string,
  field: PillarKey
): Promise<number> {
  const database = getDb();
  const existing = await getLogByDate(date);

  const currentValue = existing?.[field] ?? 0;
  const newValue = currentValue === 1 ? 0 : 1;

  await upsertLog(date, { [field]: newValue });

  return newValue;
}

/**
 * Get logs for a date range (inclusive).
 * Results are ordered by date ascending.
 */
export async function getLogsInRange(
  startDate: string,
  endDate: string
): Promise<DailyLog[]> {
  const database = getDb();
  const results = await database.getAllAsync<DailyLog>(
    'SELECT * FROM daily_logs WHERE date >= ? AND date <= ? ORDER BY date ASC',
    startDate,
    endDate
  );
  return results;
}

/**
 * Calculate the number of calendar weeks in a period of N days.
 */
function countWeeks(days: number): number {
  return Math.ceil(days / 7);
}

/**
 * Calculate Biological Defense Score (BDS) — the average of all 5 pillar percentages,
 * capped at 100% for the aggregate (individual pillars may exceed 100%).
 */
export async function getBiologicalDefenseScore(daysBack: number): Promise<number> {
  const pillars = await getPerPillarCompliance(daysBack);
  const values = ALL_PILLARS.map((p) => pillars[p]);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.min(avg, 1); // Aggregate capped at 100%
}

/**
 * Calculate compliance rate for a given number of days back from today.
 * Returns a value from 0 to 1 (or 0 if no data).
 *
 * Uses the BDS formula: average of all 5 pillar percentages, capped at 100%.
 * Kept for backward compatibility with old analytics code.
 */
export async function getComplianceRate(daysBack: number): Promise<number> {
  return getBiologicalDefenseScore(daysBack);
}

/**
 * Calculate per-pillar compliance rates using the new dynamic weekly targeting:
 *
 * - Muscle & Bone:   actual / (ceil(daysBack/7) * 3)  → can exceed 100% (overachievement)
 * - Mitochondria/VO2: actual / (ceil(daysBack/7) * 2)  → can exceed 100%
 * - Fasting & Food:   actual / daysBack                → capped at 100%
 * - Sleep & Circadian: actual / daysBack               → capped at 100%
 * - Brain/Cognitive:  actual / (ceil(daysBack/7) * 5)  → can exceed 100%
 *
 * Returns values as decimals (0.0 – 1.0+ for uncapped pillars).
 */
export async function getPerPillarCompliance(daysBack: number): Promise<Record<PillarKey, number>> {
  const endDate = getTodayString();
  const startDate = getDaysAgoString(daysBack - 1);
  const logs = await getLogsInRange(startDate, endDate);

  // Count actual days per pillar
  const actualDays: Record<string, number> = {};
  for (const pillar of ALL_PILLARS) {
    actualDays[pillar] = 0;
  }

  for (const log of logs) {
    for (const pillar of ALL_PILLARS) {
      actualDays[pillar] += log[pillar];
    }
  }

  // Calculate rates using dynamic targets
  const weeks = countWeeks(daysBack);
  const result: Record<string, number> = {};

  for (const pillar of ALL_PILLARS) {
    const target = PILLAR_TARGETS[pillar];
    const days = actualDays[pillar];

    let rate: number;
    if (target.noCap) {
      // Weekly target: muscle (3x), vo2 (2x), brain (5x)
      const expectedDays = weeks * target.perWeek;
      rate = expectedDays > 0 ? days / expectedDays : 0;
    } else {
      // Daily target: fasting (7x), sleep (7x) → every day
      rate = daysBack > 0 ? Math.min(days / daysBack, 1) : 0;
    }

    result[pillar] = rate;
  }

  return result as Record<PillarKey, number>;
}

type DayBreakdownRow = { date: string; compliance: number } & Record<PillarKey, number>;

/**
 * Get detailed compliance breakdown per day for the last N days.
 * Returns an array of objects with date and all 5 pillar values.
 */
export async function getDailyBreakdown(daysBack: number): Promise<DayBreakdownRow[]> {
  const endDate = getTodayString();
  const startDate = getDaysAgoString(daysBack - 1);

  const logs = await getLogsInRange(startDate, endDate);

  // Build a map for O(1) lookup
  const logMap = new Map<string, DailyLog>();
  for (const log of logs) {
    logMap.set(log.date, log);
  }

  // Generate all dates in range and map to logs
  const result: DayBreakdownRow[] = [];

  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = formatDate(current);
    const log = logMap.get(dateStr);

    const row: Record<string, number | string> = {
      date: dateStr,
      compliance: 0,
    };

    if (log) {
      let totalActive = 0;
      for (const p of ALL_PILLARS) {
        row[p] = log[p];
        totalActive += log[p];
      }
      row.compliance = totalActive / ALL_PILLARS.length;
    } else {
      for (const p of ALL_PILLARS) {
        row[p] = 0;
      }
      row.compliance = 0;
    }

    result.push(row as DayBreakdownRow);

    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Weekly summary data returned by getWeeklySummary().
 */
export interface WeeklySummary {
  weekStart: string;       // YYYY-MM-DD (Monday)
  weekEnd: string;         // YYYY-MM-DD (Sunday)
  daysLogged: number;      // Number of days with at least one pillar checked
  totalDays: number;        // 7
  bds: number;              // BDS for the week (0-1)
  pillars: Record<PillarKey, { days: number; rate: number; isSupercharged: boolean }>;
  topPillar: PillarKey | null;     // Best performing pillar
  lowPillar: PillarKey | null;     // Worst performing pillar
  notes: string[];                 // Recent notes from the week
}

/**
 * Format a Date object to YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get the Monday of the current ISO week.
 */
function getMondayOfWeek(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (day === 0 ? 6 : day - 1); // Days since Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return formatDate(monday);
}

/**
 * Get the Sunday of the current ISO week.
 */
function getSundayOfWeek(): string {
  const monday = getMondayOfWeek();
  return shiftDate(monday, 6);
}

/**
 * Get a detailed weekly summary for the current ISO week (Mon–Sun).
 */
export async function getWeeklySummary(): Promise<WeeklySummary> {
  const weekStart = getMondayOfWeek();
  const weekEnd = getSundayOfWeek();
  const logs = await getLogsInRange(weekStart, weekEnd);

  // Count days per pillar and total days with any activity
  const pillarDays: Record<string, number> = {};
  for (const p of ALL_PILLARS) {
    pillarDays[p] = 0;
  }
  let daysLogged = 0;
  const weekNotes: string[] = [];

  for (const log of logs) {
    let hasActivity = false;
    for (const p of ALL_PILLARS) {
      if (log[p] === 1) {
        pillarDays[p] += 1;
        hasActivity = true;
      }
    }
    if (hasActivity) daysLogged++;
    if (log.notes && log.notes.trim()) {
      weekNotes.push(log.notes.trim());
    }
  }

  // Calculate rates directly from ISO week logs (NOT sliding 7-day window)
  // Using the same dynamic weekly targeting logic as getPerPillarCompliance
  const weeks = 1; // ISO week is exactly 1 week
  const totalWeekDays = 7;

  const pillarEntries: Record<string, { days: number; rate: number; isSupercharged: boolean }> = {};
  let bestPillar: PillarKey | null = null;
  let bestRate = -1;
  let worstPillar: PillarKey | null = null;
  let worstRate = Infinity;
  let bdsSum = 0;

  for (const p of ALL_PILLARS) {
    const target = PILLAR_TARGETS[p];
    const actualDays = pillarDays[p];

    let rate: number;
    if (target.noCap) {
      const expectedDays = weeks * target.perWeek;
      rate = expectedDays > 0 ? actualDays / expectedDays : 0;
    } else {
      rate = totalWeekDays > 0 ? Math.min(actualDays / totalWeekDays, 1) : 0;
    }

    const isSupercharged = target.noCap && rate > 1;
    pillarEntries[p] = {
      days: actualDays,
      rate,
      isSupercharged,
    };

    bdsSum += Math.min(rate, 1); // Cap each pillar at 1.0 for BDS

    if (rate > bestRate) { bestRate = rate; bestPillar = p; }
    if (rate < worstRate) { worstRate = rate; worstPillar = p; }
  }

  const bds = Math.min(bdsSum / ALL_PILLARS.length, 1);

  return {
    weekStart,
    weekEnd,
    daysLogged,
    totalDays: 7,
    bds,
    pillars: pillarEntries as Record<PillarKey, { days: number; rate: number; isSupercharged: boolean }>,
    topPillar: bestPillar,
    lowPillar: worstPillar,
    notes: weekNotes.slice(-3), // Last 3 notes
  };
}

/**
 * Get a human-readable suggestion for the weekly focus.
 */
export function getWeeklyFocusSuggestion(lowPillar: PillarKey | null): string {
  const suggestions: Record<PillarKey, string> = {
    muscle_bone: '🏋️ Tambah 1 sesi dumbbell minggu depan — otot butuh stimulus 3x/minggu!',
    vo2_heart: '🫀 Coba HIIT 5 menit tiap pagi — naikin VO₂ max itu kunci umur panjang!',
    fasting_food: '🥗 Fokus jaga jendela puasa 17:7 dan protein di tiap meal minggu depan.',
    sleep_circadian: '☀️ Prioritaskan sinar matahari pagi + matikan gadget 1 jam sebelum tidur.',
    brain_cognitive: '🧠 Jadwalkan 30 menit deep reading tiap hari — no distractions!',
  };
  if (!lowPillar) return 'Lanjutkan konsistensimu minggu depan! 💪';
  return suggestions[lowPillar];
}

// ─── Existing helpers unchanged below ────────────────────────────────

/**
 * Get today's date as YYYY-MM-DD string.
 */
export function getTodayString(): string {
  return formatDate(new Date());
}

/**
 * Get a date N days ago as YYYY-MM-DD string.
 */
export function getDaysAgoString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return formatDate(d);
}

/**
 * Shift a YYYY-MM-DD string by N days (positive = forward, negative = backward).
 */
export function shiftDate(dateStr: string, offset: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offset);
  return formatDate(date);
}

/**
 * Get the full filesystem path to the SQLite database file.
 * Used for export/sharing.
 */
export function getDatabasePath(): string {
  const database = getDb();
  return database.databasePath;
}

/**
 * Format a YYYY-MM-DD string to a human-readable day name.
 */
export function getDayName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

/**
 * Format a YYYY-MM-DD string to "Mon, Jun 30" format.
 */
export function formatDateHuman(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${d}`;
}
