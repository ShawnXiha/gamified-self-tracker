export function getLogicalDate(timestamp: Date | string | number): string {
  const date = new Date(timestamp);
  
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided');
  }

  const logicalDate = new Date(date);
  
  // If the time is strictly before 04:00:00 local time,
  // it logically belongs to the previous calendar day.
  if (logicalDate.getHours() < 4) {
    logicalDate.setDate(logicalDate.getDate() - 1);
  }
  
  const year = logicalDate.getFullYear();
  const month = String(logicalDate.getMonth() + 1).padStart(2, '0');
  const day = String(logicalDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

export function isToday(logicalDate: string): boolean {
  const todayLogical = getLogicalDate(new Date());
  return logicalDate === todayLogical;
}

export function parseYYYYMMDDToUTCms(dateStr: string): number {
  if (typeof dateStr !== 'string') throw new Error('Expected YYYY-MM-DD string');
  const parts = dateStr.split('-');
  if (parts.length !== 3) throw new Error('Invalid date format; expected YYYY-MM-DD');
  
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('Invalid numeric parts in date string');
  }
  
  if (month < 1 || month > 12) throw new Error('Month out of range in date string');
  if (day < 1 || day > 31) throw new Error('Day out of range in date string');
  
  return Date.UTC(year, month - 1, day);
}

export function calculateDayGap(date1: string, date2: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const ms1 = parseYYYYMMDDToUTCms(date1);
  const ms2 = parseYYYYMMDDToUTCms(date2);
  
  return Math.floor((ms2 - ms1) / msPerDay);
}

/**
 * Returns the logical date `days` days after (or before, for negative values)
 * the given logical date. Arithmetic runs in UTC, so month and year rollovers
 * are independent of the machine's timezone.
 */
export function addDaysToLogicalDate(dateStr: string, days: number): string {
  const ms = parseYYYYMMDDToUTCms(dateStr);
  const date = new Date(ms);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export function isMonday(logicalDate: string): boolean {
  const parts = logicalDate.split('-');
  if (parts.length !== 3) throw new Error('Invalid date format; expected YYYY-MM-DD');
  
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  
  // Use local timezone to get the day of week.
  const date = new Date(year, month - 1, day);
  return date.getDay() === 1; // 0 = Sunday, 1 = Monday
}

export function getPast7LogicalDays(logicalDate: string): string[] {
  const ms = parseYYYYMMDDToUTCms(logicalDate);
  const days: string[] = [];
  const msPerDay = 24 * 60 * 60 * 1000;
  
  // We want the 7 days PRECEDING the given logicalDate.
  // i.e. logicalDate - 7 days, to logicalDate - 1 day.
  for (let i = 7; i >= 1; i--) {
    const pastMs = ms - i * msPerDay;
    const date = new Date(pastMs);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getUTCDate()).padStart(2, '0');
    days.push(`${year}-${month}-${dayStr}`);
  }
  
  return days;
}
