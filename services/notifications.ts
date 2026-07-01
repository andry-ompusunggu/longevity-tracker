import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const CHANNEL_ID = 'daily-checkin';
const NOTIFICATION_ID = 'daily-reminder-21';

/**
 * Detect if running inside Expo Go (StoreClient) vs a development build (Standalone).
 * expo-notifications push token auto-registration triggers a console.error
 * in Expo Go SDK 53+. We skip the import entirely to keep the terminal clean.
 */
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Lazy-load expo-notifications only when NOT in Expo Go.
 * This completely avoids the import-time console.error about push notifications
 * being removed from Expo Go (our app only uses local notifications).
 */
async function loadNotifications(): Promise<typeof import('expo-notifications') | null> {
  if (IS_EXPO_GO) {
    console.log('ℹ️ Daily reminder: needs a development build. Run "npx expo run:android" to build one.');
    return null;
  }
  try {
    return await import('expo-notifications');
  } catch {
    console.log('expo-notifications not available');
    return null;
  }
}

/**
 * Setup the daily reminder at the specified hour (24h format).
 *
 * Steps:
 * 1. Configure foreground notification handler
 * 2. Create Android notification channel
 * 3. Request runtime permission (Android 13+)
 * 4. Schedule daily trigger
 *
 * Safe to call multiple times — cancels any existing schedule first.
 */
export async function setupNotifications(hour = 21): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
    // Configure how notifications appear when app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    // Android 8+ needs a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Daily Check-in Reminder',
        description: 'Reminds you to log your daily longevity check-in',
        importance: Notifications.AndroidImportance.DEFAULT,
        enableVibrate: true,
        vibrationPattern: [0, 100, 100, 100],
        lightColor: '#1A1A1A',
      });
    }

    // Android 13+ requires runtime permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted — reminder not scheduled');
      return;
    }

    // Cancel existing first to prevent duplicates, then schedule
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'Daily Check-in Reminder',
        body: 'Jangan lupa catat hari ini: Muscle, VO₂, Food, Sleep & Brain — cuma 5 tap aja! 💪🫀🥗☀️🧠',
        data: { screen: 'dashboard' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });

    console.log(`✅ Daily reminder scheduled for ${hour}:00`);
  } catch (err) {
    console.error('Failed to setup notifications:', err);
  }
}

/**
 * Cancel the daily reminder.
 */
export async function cancelReminder(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_ID);
    console.log('All reminders cancelled');
  } catch (err) {
    console.error('Failed to cancel reminder:', err);
  }
}

// ─── Weekly Review Notification (Sunday 19:00) ───────────────────────────────

const WEEKLY_CHANNEL_ID = 'weekly-review';
const WEEKLY_REVIEW_ID = 'weekly-review-sun';

/**
 * Schedule a weekly review notification on Sunday at 19:00.
 */
export async function setupWeeklyReview(hour = 19): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
    // Create Android notification channel for weekly review
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(WEEKLY_CHANNEL_ID, {
        name: 'Weekly Review',
        description: 'Your weekly longevity summary and focus suggestion',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#D97706',
      });
    }

    // Cancel existing to prevent duplicates, then schedule for Sunday (day 1 in Weekday format)
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_REVIEW_ID,
      content: {
        title: '📊 Weekly Review Ready!',
        body: 'Minggu ini gimana? Buka app buat lihat skor BDS mingguan dan fokus mingdep!',
        data: { screen: 'analytics' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1, // Sunday
        hour,
        minute: 0,
      },
    });

    console.log(`✅ Weekly review scheduled for Sunday ${hour}:00`);
  } catch (err) {
    console.error('Failed to setup weekly review:', err);
  }
}
