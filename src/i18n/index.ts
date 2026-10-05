import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { en } from './en';
import { it, type Dict } from './it';

/**
 * Lingue: inglese predefinito, italiano se il telefono è in italiano.
 * L'utente può forzarla dalle impostazioni ('auto' | 'it' | 'en').
 */
export type LangSetting = 'auto' | 'it' | 'en';
export type Lang = 'it' | 'en';

const dicts: Record<Lang, Dict> = { it, en };

function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    return code === 'it' ? 'it' : 'en';
  } catch {
    return 'en';
  }
}

let setting: LangSetting = 'auto';
let current: Lang = deviceLang();
const listeners = new Set<() => void>();

export function setLanguage(s: LangSetting) {
  setting = s;
  const next = s === 'auto' ? deviceLang() : s;
  if (next !== current) {
    current = next;
    listeners.forEach((fn) => fn());
  }
}

export function getLanguage(): Lang {
  return current;
}

export function getLanguageSetting(): LangSetting {
  return setting;
}

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Leaves<Dict>;

/** Traduce una chiave ("player.skipIntro"), con segnaposto {nome}. Fuori dai componenti. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  const pick = (d: Dict) => key.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), d);
  let s: string = pick(dicts[current]) ?? pick(dicts.en) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const bound: Partial<Record<Lang, typeof t>> = {};

/**
 * Nei componenti: rende di nuovo quando cambia la lingua.
 * La `t` restituita cambia identità con la lingua: col React Compiler una funzione sempre uguale
 * farebbe riusare i testi già calcolati (es. i titoli delle tab restavano nella lingua vecchia).
 */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  const tl = (bound[lang] ??= ((key, vars) => t(key, vars)) as typeof t);
  return { t: tl, lang };
}

/** Locale per date/numeri. */
export function locale() {
  return current === 'it' ? 'it-IT' : 'en-US';
}
