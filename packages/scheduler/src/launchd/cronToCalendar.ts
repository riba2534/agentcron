import { CCT, cct } from '@cct/shared';
import { CronExpressionParser } from 'cron-parser';

export interface CalendarEntry {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Month?: number;
  Weekday?: number;
}

const MAX_ENTRIES = 1000;

const TOTAL_MINUTES = 60;
const TOTAL_HOURS = 24;
const TOTAL_DOM = 31;
const TOTAL_DOW = 7;
const TOTAL_MONTHS = 12;

function readField(field: { values: ReadonlyArray<number | string> }): number[] {
  const out: number[] = [];
  for (const v of field.values) if (typeof v === 'number') out.push(v);
  return out;
}

function normalizedDow(values: number[]): number[] {
  const set = new Set<number>();
  for (const v of values) set.add(v === 7 ? 0 : v);
  return [...set].sort((a, b) => a - b);
}

interface RawCronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

function rawFields(cron: string): RawCronFields | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parts[0]!,
    hour: parts[1]!,
    dayOfMonth: parts[2]!,
    month: parts[3]!,
    dayOfWeek: parts[4]!,
  };
}

const isStar = (s: string) => s === '*';

const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function cronToCalendarIntervals(
  cron: string,
  tz: string = 'UTC',
): CalendarEntry[] {
  let parsed: ReturnType<typeof CronExpressionParser.parse>;
  try {
    parsed = CronExpressionParser.parse(cron, { tz });
  } catch (e) {
    throw cct.badRequest(CCT.TASK_INVALID_CRON, (e as Error).message);
  }

  const minutes = readField(parsed.fields.minute);
  const hours = readField(parsed.fields.hour);
  const doms = readField(parsed.fields.dayOfMonth);
  const dows = normalizedDow(readField(parsed.fields.dayOfWeek));
  const months = readField(parsed.fields.month);

  const raw = rawFields(cron);
  const minuteWild = raw ? isStar(raw.minute) : minutes.length === TOTAL_MINUTES;
  const hourWild = raw ? isStar(raw.hour) : hours.length === TOTAL_HOURS;
  const domWild = raw ? isStar(raw.dayOfMonth) : doms.length === TOTAL_DOM;
  const dowWild = raw ? isStar(raw.dayOfWeek) : dows.length === TOTAL_DOW;
  const monthWild = raw ? isStar(raw.month) : months.length === TOTAL_MONTHS;

  if (minuteWild && hourWild && domWild && dowWild && monthWild) {
    return [{}];
  }

  const result: CalendarEntry[] = [];

  const pushEntry = (entry: CalendarEntry) => {
    result.push(entry);
    if (result.length > MAX_ENTRIES) {
      throw cct.badRequest(CCT.SCHEDULER_CRON_TOO_DENSE, {
        cron,
        produced: result.length,
        max: MAX_ENTRIES,
      });
    }
  };

  const expandMonth = !monthWild || (!domWild && dowWild);
  const monthIter = expandMonth ? (monthWild ? ALL_MONTHS : months) : [undefined];

  for (const m of minutes) {
    for (const h of hours) {
      for (const mo of monthIter) {
        const base: CalendarEntry = { Minute: m, Hour: h };
        if (mo !== undefined) base.Month = mo;

        if (!domWild && !dowWild) {
          for (const d of doms) pushEntry({ ...base, Day: d });
          for (const w of dows) pushEntry({ ...base, Weekday: w });
        } else if (!domWild) {
          for (const d of doms) pushEntry({ ...base, Day: d });
        } else if (!dowWild) {
          for (const w of dows) pushEntry({ ...base, Weekday: w });
        } else {
          pushEntry(base);
        }
      }
    }
  }

  return result;
}
