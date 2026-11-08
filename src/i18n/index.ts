import { en, type StringKey } from './en';
import { tr } from './tr';

const lang = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lang') === 'tr' ? 'tr' : 'en';
const dict: Record<StringKey, string> = lang === 'tr' ? tr : en;

export const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function num(v: number, digits = 2): string {
  return v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pct(p: number, digits = 0): string {
  return (p * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';
}

export type { StringKey };
