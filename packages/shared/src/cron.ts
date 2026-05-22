import { CronExpressionParser } from 'cron-parser';
import { CCT, cct } from './errors.js';

const CRON_5_FIELD = /^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/;

export function isValidCron(expression: string, timezone: string): boolean {
  if (!CRON_5_FIELD.test(expression)) return false;
  try {
    CronExpressionParser.parse(expression, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute the next N fire times for a cron expression in the given IANA timezone.
 * Returns ISO 8601 UTC strings.
 */
export function nextFireTimes(expression: string, timezone: string, count = 5): string[] {
  if (!isValidIanaTimezone(timezone)) {
    throw cct.badRequest(CCT.TASK_INVALID_TIMEZONE);
  }
  if (!CRON_5_FIELD.test(expression)) {
    throw cct.badRequest(CCT.TASK_INVALID_CRON);
  }
  let iter: ReturnType<typeof CronExpressionParser.parse>;
  try {
    iter = CronExpressionParser.parse(expression, { tz: timezone });
  } catch (e) {
    throw cct.badRequest(CCT.TASK_INVALID_CRON, (e as Error).message);
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(iter.next().toDate().toISOString());
  }
  return out;
}
