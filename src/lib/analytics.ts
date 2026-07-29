import type { MessageEvent } from "./message-events.functions";

export type PeriodKey = "today" | "7d" | "30d" | "custom";

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - (n - 1));
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function countSince(events: MessageEvent[], from: Date, to?: Date): number {
  const f = from.getTime();
  const t = to ? to.getTime() : Infinity;
  let n = 0;
  for (const e of events) {
    const ts = new Date(e.sent_at).getTime();
    if (ts >= f && ts <= t) n++;
  }
  return n;
}

export function inRange(events: MessageEvent[], from: Date, to: Date): MessageEvent[] {
  const f = from.getTime();
  const t = to.getTime();
  return events.filter((e) => {
    const ts = new Date(e.sent_at).getTime();
    return ts >= f && ts <= t;
  });
}

export type SellerRow = {
  person_name: string;
  today: number;
  last7: number;
  period: number;
  accounts: { linkedin_account: string; count: number }[];
};

export function buildRanking(
  events: MessageEvent[],
  periodFrom: Date,
  periodTo: Date,
): SellerRow[] {
  const today = startOfToday().getTime();
  const week = daysAgo(7).getTime();
  const map = new Map<string, SellerRow & { _accounts: Map<string, number> }>();

  for (const e of inRange(events, periodFrom, periodTo)) {
    const ts = new Date(e.sent_at).getTime();
    let row = map.get(e.person_name);
    if (!row) {
      row = {
        person_name: e.person_name,
        today: 0,
        last7: 0,
        period: 0,
        accounts: [],
        _accounts: new Map(),
      };
      map.set(e.person_name, row);
    }
    row.period++;
    if (ts >= today) row.today++;
    if (ts >= week) row.last7++;
    row._accounts.set(e.linkedin_account, (row._accounts.get(e.linkedin_account) ?? 0) + 1);
  }

  return [...map.values()]
    .map((row) => ({
      person_name: row.person_name,
      today: row.today,
      last7: row.last7,
      period: row.period,
      accounts: [...row._accounts.entries()]
        .map(([linkedin_account, count]) => ({ linkedin_account, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.period - a.period || b.today - a.today);
}

export function buildDailySeries(events: MessageEvent[], days = 14) {
  const buckets = new Map<string, number>();
  const start = daysAgo(days);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    buckets.set(dayKey(d), 0);
  }
  for (const e of events) {
    const d = new Date(e.sent_at);
    const key = dayKey(d);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([key, total]) => {
    const [, m, d] = key.split("-");
    return { day: `${d}/${m}`, total };
  });
}
