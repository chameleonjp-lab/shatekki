import type { FinalResult, PrizeTypeId, RuntimeCatalog, Vec3 } from '../contracts';
import { formatInteger, translate, type Locale } from '../i18n';
import type { ShotReplay } from '../view/shot-replay';
import { prizePortrait } from '../view/prize-portrait';
import './festival-result.css';

const WORDS: Record<Locale, readonly [path: string, highlight: string, replay: string, featured: string]> = {
  ja: ['弾道', '一発ハイライト', 'もう一度再生', '最高得点の景品'],
  en: ['Cork path', 'Shot highlight', 'Replay', 'Highest-scoring prize'],
  es: ['Trayectoria', 'Tiro destacado', 'Repetir', 'Premio de mayor puntuación'],
  'pt-BR': ['Trajetória', 'Disparo em destaque', 'Repetir', 'Prêmio de maior pontuação'],
  'zh-Hans': ['弹道', '精彩一发', '重播', '最高分奖品'],
  fr: ['Trajectoire', 'Tir marquant', 'Rejouer', 'Lot le mieux noté'],
  de: ['Flugbahn', 'Schuss-Highlight', 'Wiederholen', 'Preis mit den meisten Punkten'],
  ko: ['탄도', '한 발 하이라이트', '다시 재생', '최고 득점 경품'],
  ru: ['Траектория', 'Яркий выстрел', 'Повторить', 'Самый ценный приз'],
  it: ['Traiettoria', 'Tiro da ricordare', 'Riproduci', 'Premio con più punti'],
  'zh-Hant': ['彈道', '精彩一發', '重播', '最高分獎品'],
  id: ['Lintasan', 'Sorotan tembakan', 'Putar ulang', 'Hadiah dengan poin tertinggi'],
  tr: ['Yörünge', 'Öne çıkan atış', 'Tekrar oynat', 'En yüksek puanlı ödül'],
  vi: ['Đường đạn', 'Phát bắn nổi bật', 'Phát lại', 'Phần thưởng nhiều điểm nhất'],
  th: ['วิถีกระสุน', 'ช็อตเด่น', 'เล่นซ้ำ', 'รางวัลคะแนนสูงสุด'],
};

const SVG = 'http://www.w3.org/2000/svg';
const project = ({ x, y, z }: Vec3) => ({ x: x + .47 * z, y: -y + .31 * z });

function shotPath(doc: Document, replay: ShotReplay, label: string, compact = false): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  const tracks = replay.tracks.map(track => ({ points: track.points.map(project), contacts: track.contacts.map(project) }));
  const all = tracks.flatMap(track => track.points);
  const left = Math.min(...all.map(p => p.x));
  const right = Math.max(...all.map(p => p.x));
  const top = Math.min(...all.map(p => p.y));
  const bottom = Math.max(...all.map(p => p.y));
  const width = compact ? 240 : 280;
  const height = compact ? 46 : 134;
  const margin = compact ? 5 : 12;
  const scale = Math.min((width - margin * 2) / Math.max(right - left, .1), (height - margin * 2) / Math.max(bottom - top, .1));
  const toSvgX = (x: number) => width / 2 + (x - (left + right) / 2) * scale;
  const toSvgY = (y: number) => height / 2 + (y - (top + bottom) / 2) * scale;
  svg.classList.add('festival-path');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  for (const [index, track] of tracks.entries()) {
    const line = doc.createElementNS(SVG, 'polyline');
    line.setAttribute('points', track.points.map(p => `${toSvgX(p.x).toFixed(2)},${toSvgY(p.y).toFixed(2)}`).join(' '));
    line.setAttribute('pathLength', '1');
    line.style.setProperty('--branch', String(index));
    line.classList.add(index === 0 ? 'main' : 'branch');
    svg.append(line);
    for (const { x, y } of track.contacts) {
      const contact = doc.createElementNS(SVG, 'circle');
      contact.setAttribute('cx', String(toSvgX(x)));
      contact.setAttribute('cy', String(toSvgY(y)));
      contact.setAttribute('r', compact ? '2.2' : '3.1');
      svg.append(contact);
    }
  }
  return svg;
}

export function miniShotPath(doc: Document, replay: ShotReplay, locale: Locale, quiet: boolean): HTMLElement {
  const box = doc.createElement('div');
  box.className = 'festival-mini-path';
  box.dataset.testid = 'shot-mini-path';
  const svg = shotPath(doc, replay, WORDS[locale][0], true);
  if (!quiet) svg.classList.add('is-playing');
  box.append(svg);
  return box;
}

export function resultHighlight(
  doc: Document, replay: ShotReplay, locale: Locale, quiet: boolean, nameOf: (id: string) => string,
): HTMLElement {
  const sec = doc.createElement('section');
  sec.className = 'sec festival-highlight';
  sec.dataset.testid = 'festival-highlight';
  const [path, title, repeat] = WORDS[locale];
  const heading = doc.createElement('h3');
  const facts = doc.createElement('p');
  const picture = doc.createElement('div');
  picture.className = 'festival-highlight-picture';
  const svg = shotPath(doc, replay, path);
  if (!quiet) svg.classList.add('is-playing');
  picture.append(svg);
  heading.textContent = title;
  const delta = new Intl.NumberFormat(locale, { signDisplay: 'always' }).format(replay.points);
  facts.textContent = `#${formatInteger(locale, replay.shotNumber)} · ${translate(locale, 'unit.points', { n: delta })}`;
  sec.append(heading, facts, picture);
  if (replay.prizeTypes.length) {
    const prizes = doc.createElement('ul');
    prizes.className = 'festival-highlight-prizes';
    const types = new Map<string, number>();
    for (const type of replay.prizeTypes) types.set(type, (types.get(type) ?? 0) + 1);
    for (const [type, count] of types) {
      const li = doc.createElement('li');
      const name = nameOf(type);
      li.append(prizePortrait(doc, type), count > 1 ? `${name} ×${formatInteger(locale, count)}` : name);
      prizes.append(li);
    }
    sec.append(prizes);
  }
  if (!quiet) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = repeat;
    button.addEventListener('click', () => {
      svg.classList.remove('is-playing');
      // Restart the stroke animation when the same path is replayed.
      void svg.getBoundingClientRect();
      svg.classList.add('is-playing');
    });
    sec.append(button);
  }
  return sec;
}

export function resultPrizeShelf(doc: Document, result: FinalResult, catalog: RuntimeCatalog, locale: Locale, nameOf: (id: string) => string, quiet: boolean): HTMLElement {
  const list = doc.createElement('ul');
  list.className = 'festival-prize-shelf';
  list.dataset.testid = 'festival-prize-shelf';
  if (!quiet) list.classList.add('is-revealing');
  const setMembers = new Set(result.completedSets.flatMap(id => catalog.sets.get(id)?.requiredTypeIds ?? []));
  const pointsByShot = new Map(result.ledger.map(shot => [
    shot.shotId, new Map(shot.items.filter(item => item.kind === 'prize').map(item => [item.refId, item.points])),
  ]));
  let featured: PrizeTypeId | null = null;
  let highest = -Infinity;
  const counts = new Map<PrizeTypeId, number>();
  for (const prize of result.collected) {
    counts.set(prize.typeId, (counts.get(prize.typeId) ?? 0) + 1);
    const points = pointsByShot.get(prize.shotId)?.get(prize.instanceId);
    if (points !== undefined && points > highest) {
      highest = points;
      featured = prize.typeId;
    }
  }
  for (const [index, [type, count]] of Array.from(counts.entries()).entries()) {
    const tile = doc.createElement('li');
    const label = doc.createElement('span');
    const name = nameOf(type);
    label.textContent = count > 1 ? `${name} ×${formatInteger(locale, count)}` : name;
    tile.className = 'festival-prize';
    tile.style.setProperty('--arrival', `${index * 120}ms`);
    if (setMembers.has(type)) tile.classList.add('in-set');
    if (type === featured) {
      tile.classList.add('featured');
      const ribbon = doc.createElement('b');
      const crown = doc.createElement('span');
      crown.setAttribute('aria-hidden', 'true');
      crown.textContent = '♛ ';
      ribbon.append(crown, WORDS[locale][3]);
      tile.append(ribbon);
    }
    tile.append(prizePortrait(doc, type), label);
    list.append(tile);
  }
  return list;
}

export function recordBreak(doc: Document, previous: number, score: number, locale: Locale, quiet: boolean): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'festival-record';
  wrap.dataset.testid = 'festival-record';
  const change = doc.createElement('strong');
  const improvement = new Intl.NumberFormat(locale, { signDisplay: 'always' }).format(score - previous);
  change.textContent = translate(locale, 'unit.points', { n: improvement });
  wrap.append(change);
  if (!quiet) {
    for (const side of ['left', 'right']) {
      const half = doc.createElement('span');
      half.className = `festival-record-half ${side}`;
      half.textContent = formatInteger(locale, previous);
      half.setAttribute('aria-hidden', 'true');
      wrap.append(half);
    }
  }
  return wrap;
}
