import type { FestivalChallenge, ShotSummary } from '../contracts';
import { FESTIVAL_TEXT } from './festival-gimmick-text';
import type { Locale } from '../i18n';
import './festival-challenge-card.css';

const TITLES: Record<Locale, Record<FestivalChallenge, string>> = {
  ja: { 'three-shelves': '三段抜き！', 'fan-tray': 'うちわ・お盆の二重反射！' },
  en: { 'three-shelves': 'All three shelves!', 'fan-tray': 'Fan–tray double ricochet!' },
  es: { 'three-shelves': '¡Las tres baldas!', 'fan-tray': '¡Doble rebote en abanico y bandeja!' },
  'pt-BR': { 'three-shelves': 'As três prateleiras!', 'fan-tray': 'Rebote duplo no leque e na bandeja!' },
  'zh-Hans': { 'three-shelves': '三层全中！', 'fan-tray': '团扇与托盘双重反弹！' },
  fr: { 'three-shelves': 'Les trois étagères !', 'fan-tray': 'Double ricochet sur l’éventail et le plateau !' },
  de: { 'three-shelves': 'Alle drei Regale!', 'fan-tray': 'Doppelabpraller an Fächer und Tablett!' },
  ko: { 'three-shelves': '선반 세 단 명중!', 'fan-tray': '부채와 쟁반 이중 반사!' },
  ru: { 'three-shelves': 'Все три полки!', 'fan-tray': 'Двойной рикошет от веера и подноса!' },
  it: { 'three-shelves': 'Tutti e tre i ripiani!', 'fan-tray': 'Doppio rimbalzo su ventaglio e vassoio!' },
  'zh-Hant': { 'three-shelves': '三層全中！', 'fan-tray': '團扇與托盤雙重反彈！' },
  id: { 'three-shelves': 'Ketiga rak kena!', 'fan-tray': 'Pantulan ganda di kipas dan baki!' },
  tr: { 'three-shelves': 'Üç raf birden!', 'fan-tray': 'Yelpaze ve tepsiden çift sekme!' },
  vi: { 'three-shelves': 'Trúng cả ba tầng!', 'fan-tray': 'Nảy kép qua quạt và khay!' },
  th: { 'three-shelves': 'โดนครบสามชั้น!', 'fan-tray': 'แฉลบสองครั้งจากพัดและถาด!' },
};

export function festivalChallengeCard(doc: Document, summary: ShotSummary, locale: Locale, quiet: boolean): HTMLElement | null {
  const entries: { cls: string; text: string }[] = (summary.festivalChallenges ?? []).map(id => ({ cls: id, text: TITLES[locale][id] }));
  const [relay, domino, pair, bell, bellPrize, daruma, giant, fuse, encore] = FESTIVAL_TEXT[locale];
  const words = { relay, 'red-white': pair, 'bell-open': bell, 'bell-prize': bellPrize, daruma, 'giant-drop': giant, fuse, encore } as const;
  const ledgerId = { relay: 'relay', 'bell-prize': 'bell-prize', 'giant-drop': 'giant', encore: 'encore' } as const;
  const fmt = new Intl.NumberFormat(locale);
  for (const { mark } of summary.festival?.signals ?? []) {
    if (!(mark in words)) continue;
    const id = mark in ledgerId ? ledgerId[mark as keyof typeof ledgerId] : undefined;
    const points = id ? summary.ledger.items.find(item => item.refId === `festival:${id}:${summary.shotId}`)?.points : undefined;
    entries.push({ cls: mark, text: words[mark as keyof typeof words] + (points ? ' +' + fmt.format(points) : '') });
  }
  const count = summary.festival?.domino.length ?? 0;
  if (count) entries.push({ cls: 'domino', text: domino + ' ×' + fmt.format(count) });
  if (!entries.length) return null;
  const list = doc.createElement('ul');
  list.className = 'festival-challenges';
  list.dataset.quiet = String(quiet);
  list.dataset.testid = 'festival-challenges';
  for (const entry of entries) {
    const tile = doc.createElement('li');
    tile.className = entry.cls;
    tile.textContent = entry.text;
    list.append(tile);
  }
  return list;
}
