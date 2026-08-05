/**
 * Smart sending window logic for celebration emails.
 * Respects athlete rest periods by only allowing emails during specific hours.
 * 
 * Allowed Windows:
 * - Monday to Friday: 08:00-12:00 and 13:00-19:00
 * - Saturday: 09:00-12:00 and 13:00-18:00
 * - Sunday: No emails (rest day)
 */

interface SendingWindow {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

/**
 * Allowed sending windows for celebration emails.
 * Times are in the local timezone where the server runs.
 */
const SENDING_WINDOWS: SendingWindow[] = [
  // Monday to Friday - Morning window
  { dayOfWeek: 1, startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  { dayOfWeek: 2, startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  { dayOfWeek: 3, startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  { dayOfWeek: 4, startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  { dayOfWeek: 5, startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  
  // Monday to Friday - Afternoon window
  { dayOfWeek: 1, startHour: 13, startMinute: 0, endHour: 19, endMinute: 0 },
  { dayOfWeek: 2, startHour: 13, startMinute: 0, endHour: 19, endMinute: 0 },
  { dayOfWeek: 3, startHour: 13, startMinute: 0, endHour: 19, endMinute: 0 },
  { dayOfWeek: 4, startHour: 13, startMinute: 0, endHour: 19, endMinute: 0 },
  { dayOfWeek: 5, startHour: 13, startMinute: 0, endHour: 19, endMinute: 0 },
  
  // Saturday - Morning window
  { dayOfWeek: 6, startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
  
  // Saturday - Afternoon window
  { dayOfWeek: 6, startHour: 13, startMinute: 0, endHour: 18, endMinute: 0 },
];

/**
 * Converts a time to minutes since midnight for easy comparison.
 */
function timeToMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/**
 * Checks if a given date/time falls within any allowed sending window.
 * 
 * @param date - The date to check
 * @returns true if the date is within an allowed sending window, false otherwise
 * 
 * @example
 * ```typescript
 * const mondayMorning = new Date('2026-08-04T10:00:00'); // Monday 10am
 * isWithinSendingWindow(mondayMorning); // true
 * 
 * const sundayEvening = new Date('2026-08-03T20:00:00'); // Sunday 8pm
 * isWithinSendingWindow(sundayEvening); // false
 * ```
 */
export function isWithinSendingWindow(date: Date): boolean {
  const dayOfWeek = date.getDay();
  const currentMinutes = timeToMinutes(date.getHours(), date.getMinutes());

  // Check if current time falls within any window for this day
  return SENDING_WINDOWS.some((window) => {
    if (window.dayOfWeek !== dayOfWeek) {
      return false;
    }

    const windowStart = timeToMinutes(window.startHour, window.startMinute);
    const windowEnd = timeToMinutes(window.endHour, window.endMinute);

    return currentMinutes >= windowStart && currentMinutes < windowEnd;
  });
}

/**
 * Calculates the next available sending window opening time.
 * 
 * @param now - The current date/time
 * @returns A Date object representing when the next sending window opens
 * 
 * @example
 * ```typescript
 * const sundayNight = new Date('2026-08-03T20:00:00'); // Sunday 8pm
 * const nextWindow = getNextSendingWindowStart(sundayNight);
 * // Returns Monday 08:00:00
 * 
 * const tuesdayLunch = new Date('2026-08-05T12:15:00'); // Tuesday 12:15pm
 * const nextWindow = getNextSendingWindowStart(tuesdayLunch);
 * // Returns Tuesday 13:00:00 (same day, afternoon window)
 * ```
 */
export function getNextSendingWindowStart(now: Date): Date {
  const currentDay = now.getDay();
  const currentMinutes = timeToMinutes(now.getHours(), now.getMinutes());

  // Try to find a window later today
  const todayWindows = SENDING_WINDOWS.filter((w) => w.dayOfWeek === currentDay);
  
  for (const window of todayWindows) {
    const windowStart = timeToMinutes(window.startHour, window.startMinute);
    
    if (currentMinutes < windowStart) {
      // Found a window later today
      const result = new Date(now);
      result.setHours(window.startHour, window.startMinute, 0, 0);
      return result;
    }
  }

  // No more windows today, find the next available day
  for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + daysAhead);
    const checkDay = checkDate.getDay();

    const nextDayWindows = SENDING_WINDOWS.filter((w) => w.dayOfWeek === checkDay);
    
    if (nextDayWindows.length > 0) {
      // Found a window on this day, return the first window
      const firstWindow = nextDayWindows.sort((a, b) => {
        const aStart = timeToMinutes(a.startHour, a.startMinute);
        const bStart = timeToMinutes(b.startHour, b.startMinute);
        return aStart - bStart;
      })[0];

      const result = new Date(checkDate);
      result.setHours(firstWindow.startHour, firstWindow.startMinute, 0, 0);
      return result;
    }
  }

  // Fallback: shouldn't reach here, but return Monday 8am next week
  const fallback = new Date(now);
  const daysUntilMonday = (8 - fallback.getDay()) % 7 || 7;
  fallback.setDate(fallback.getDate() + daysUntilMonday);
  fallback.setHours(8, 0, 0, 0);
  return fallback;
}

/**
 * Gets a human-readable description of the next sending window.
 * Useful for displaying to admins when emails are scheduled.
 */
export function getNextWindowDescription(now: Date): string {
  const next = getNextSendingWindowStart(now);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  const dayName = dayNames[next.getDay()];
  const hours = next.getHours().toString().padStart(2, '0');
  const minutes = next.getMinutes().toString().padStart(2, '0');
  
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const nextDay = new Date(next);
  nextDay.setHours(0, 0, 0, 0);
  
  const daysDiff = Math.round((nextDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 0) {
    return `Today at ${hours}:${minutes}`;
  } else if (daysDiff === 1) {
    return `Tomorrow (${dayName}) at ${hours}:${minutes}`;
  } else {
    return `${dayName} at ${hours}:${minutes}`;
  }
}
