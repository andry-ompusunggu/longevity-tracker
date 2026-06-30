import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export interface DailyLog {
  id?: number;
  date: string; // YYYY-MM-DD
  muscle_bone: number; // 0 or 1
  fasting_nutrition: number; // 0 or 1
  brain_cognitive: number; // 0 or 1
  notes: string;
  created_at?: string;
}

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize the database connection and create the table if it doesn't exist.
 * Must be called before any other db operations.
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('longevity.db');

  // Enable WAL mode for better concurrent read performance
  await db.execAsync('PRAGMA journal_mode = WAL;');

  // Create the daily_logs table with indexed date column
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      muscle_bone INTEGER NOT NULL DEFAULT 0 CHECK(muscle_bone IN (0, 1)),
      fasting_nutrition INTEGER NOT NULL DEFAULT 0 CHECK(fasting_nutrition IN (0, 1)),
      brain_cognitive INTEGER NOT NULL DEFAULT 0 CHECK(brain_cognitive IN (0, 1)),
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create index on date column for fast lookups
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
  updates: Partial<Pick<DailyLog, 'muscle_bone' | 'fasting_nutrition' | 'brain_cognitive' | 'notes'>>
): Promise<void> {
  const database = getDb();

  // First, try to get existing row
  const existing = await getLogByDate(date);

  if (existing) {
    // Update existing row
    const muscle_bone = updates.muscle_bone ?? existing.muscle_bone;
    const fasting_nutrition = updates.fasting_nutrition ?? existing.fasting_nutrition;
    const brain_cognitive = updates.brain_cognitive ?? existing.brain_cognitive;
    const notes = updates.notes !== undefined ? updates.notes : existing.notes;

    await database.runAsync(
      `UPDATE daily_logs SET muscle_bone = ?, fasting_nutrition = ?, brain_cognitive = ?, notes = ? WHERE date = ?`,
      muscle_bone,
      fasting_nutrition,
      brain_cognitive,
      notes,
      date
    );
  } else {
    // Insert new row
    await database.runAsync(
      `INSERT INTO daily_logs (date, muscle_bone, fasting_nutrition, brain_cognitive, notes) VALUES (?, ?, ?, ?, ?)`,
      date,
      updates.muscle_bone ?? 0,
      updates.fasting_nutrition ?? 0,
      updates.brain_cognitive ?? 0,
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
  field: 'muscle_bone' | 'fasting_nutrition' | 'brain_cognitive'
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
 * Calculate compliance rate for a given number of days back from today.
 * Returns a value from 0 to 1 (or 0 if no data).
 *
 * Formula: Total approved actions / (number_of_days * 3)
 */
export async function getComplianceRate(daysBack: number): Promise<number> {
  const endDate = getTodayString();
  const startDate = getDaysAgoString(daysBack - 1);

  const logs = await getLogsInRange(startDate, endDate);

  if (logs.length === 0) return 0;

  let totalApproved = 0;
  for (const log of logs) {
    totalApproved += log.muscle_bone + log.fasting_nutrition + log.brain_cognitive;
  }

  const maxPossible = daysBack * 3;
  return Math.min(totalApproved / maxPossible, 1);
}

/**
 * Get detailed compliance breakdown per day for the last N days.
 * Returns an array of objects with date and compliance fraction.
 */
export async function getDailyBreakdown(daysBack: number): Promise<
  { date: string; compliance: number; muscle_bone: number; fasting_nutrition: number; brain_cognitive: number }[]
> {
  const endDate = getTodayString();
  const startDate = getDaysAgoString(daysBack - 1);

  const logs = await getLogsInRange(startDate, endDate);

  // Build a map for O(1) lookup
  const logMap = new Map<string, DailyLog>();
  for (const log of logs) {
    logMap.set(log.date, log);
  }

  // Generate all dates in range and map to logs
  const result: {
    date: string;
    compliance: number;
    muscle_bone: number;
    fasting_nutrition: number;
    brain_cognitive: number;
  }[] = [];

  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = formatDate(current);
    const log = logMap.get(dateStr);

    result.push({
      date: dateStr,
      compliance: log
        ? (log.muscle_bone + log.fasting_nutrition + log.brain_cognitive) / 3
        : 0,
      muscle_bone: log?.muscle_bone ?? 0,
      fasting_nutrition: log?.fasting_nutrition ?? 0,
      brain_cognitive: log?.brain_cognitive ?? 0,
    });

    current.setDate(current.getDate() + 1);
  }

  return result;
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
