/**
 * Booth overview map (requirements §4.1, plan EG07): a small 3 x 12 grid that
 * shows the range the camera currently shows, which slots hold a prize, and
 * which background cells are unused / used. Meaning never rests on colour
 * alone: a prize is a filled dot (empty = a ring), an unused cell is "?" on a
 * light tile and a used cell is "✓" on a dark tile.
 *
 * DISPLAY ONLY by default. It never fires, answers or triggers an effect. If the
 * app passes `onJump`, a tap during the position phase calls it with a target
 * stand x (the app may dispatch the existing SET_POSITION with it; the rules
 * still reject it outside the position phase). Nothing else is ever sent.
 *
 * Pure model first (`boothMapModel`, testable in Node), thin DOM second.
 */
import type { BoothLayout, ExpansionViewState, PrizeFrame, Vec3 } from '../contracts';
import { slotRowColumn } from '../contracts';
import { visibleXRange } from '../view/camera-math';
import './expanded.css';

export interface MapCell {
  readonly row: 1 | 2 | 3;
  readonly column: number;
  readonly hasPrize: boolean;
  /** null when the run has no background cells (rules-v1). */
  readonly cellState: 'unused' | 'used' | null;
  /** The slot holds a prize of the series currently outlined (shown as a mark too). */
  readonly outlined: boolean;
}

export interface MapModel {
  readonly rows: 3;
  readonly columns: number;
  /** Row-major (row 1 first), columns left to right. */
  readonly cells: readonly MapCell[];
  /** Columns (1-based, inclusive) the camera shows now; fractions are of the full width. */
  readonly view: { readonly fromColumn: number; readonly toColumn: number; readonly left: number; readonly width: number };
  readonly prizeCount: number;
  readonly usedCount: number;
}

export interface MapInput {
  readonly layout: BoothLayout;
  readonly standX: number;
  readonly aspect: number;
  readonly prizes: readonly PrizeFrame[];
  readonly cells?: ExpansionViewState['cells'];
  /** Instance ids to mark as series-outlined. */
  readonly outlined?: ReadonlySet<string>;
}

/** The v2 slot whose board position a prize stands on, or null when it is off the boards (fallen). */
export function slotIndexOfPrize(layout: BoothLayout, position: Vec3): number | null {
  const slots = layout.slots;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    const tier = layout.tiers.find((t) => t.tier === s.tier)!;
    // above this board, not above the next one; on the board depth-wise
    if (position.y < tier.topY - 0.03 || position.y > tier.topY + 0.33) continue;
    if (Math.abs(position.z - tier.centerZ) > tier.depth / 2 + 0.06) continue;
    const dx = Math.abs(position.x - s.spawnBase.x);
    if (dx > 0.25) continue;
    const d = dx + Math.abs(position.y - (tier.topY + 0.08)) * 0.1;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

export function boothMapModel(input: MapInput): MapModel {
  const { layout } = input;
  const slots = layout.slots;
  const columns = Math.max(1, ...slots.map((s) => s.column + 1));
  const occupied = new Set<number>();
  const outlined = new Set<number>();
  for (const p of input.prizes) {
    if (p.collected) continue;
    const i = slotIndexOfPrize(layout, p.position);
    if (i === null) continue;
    occupied.add(i);
    if (input.outlined?.has(p.instanceId as string)) outlined.add(i);
  }
  const cellById = new Map((input.cells ?? []).map((c) => [c.cellId as string, c.used]));
  const cells: MapCell[] = [];
  let usedCount = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    const rc = slotRowColumn(s.slotId as string) ?? { row: (3 - s.tier) as 1 | 2 | 3, column: s.column + 1 };
    const cellGeo = layout.backgroundCells?.find((c) => c.slotId === s.slotId);
    const used = cellGeo ? cellById.get(cellGeo.cellId as string) : undefined;
    const cellState = cellGeo ? (used ? 'used' : 'unused') : null;
    if (cellState === 'used') usedCount++;
    cells.push({ row: rc.row, column: rc.column, hasPrize: occupied.has(i), cellState, outlined: outlined.has(i) });
  }
  cells.sort((a, b) => a.row - b.row || a.column - b.column);

  const first = slots.reduce((m, s) => Math.min(m, s.spawnBase.x), Infinity);
  const last = slots.reduce((m, s) => Math.max(m, s.spawnBase.x), -Infinity);
  const pitch = columns > 1 ? (last - first) / (columns - 1) : 0.42;
  const edgeL = first - pitch / 2;
  const total = columns * pitch;
  const { minX, maxX } = visibleXRange(layout, input.standX, input.aspect);
  const l = Math.max(0, Math.min(1, (minX - edgeL) / total));
  const r = Math.max(0, Math.min(1, (maxX - edgeL) / total));
  const fromColumn = Math.max(1, Math.min(columns, Math.floor(l * columns + 1e-9) + 1));
  const toColumn = Math.max(fromColumn, Math.min(columns, Math.ceil(r * columns - 1e-9)));
  return { rows: 3, columns, cells, view: { fromColumn, toColumn, left: l, width: Math.max(0, r - l) }, prizeCount: occupied.size, usedCount };
}

/** Stand x for a tap at a horizontal fraction (0..1) of the map, clamped to the stand range. */
export function standXForFraction(layout: BoothLayout, fraction: number): number {
  const slots = layout.slots;
  const first = slots.reduce((m, s) => Math.min(m, s.spawnBase.x), Infinity);
  const last = slots.reduce((m, s) => Math.max(m, s.spawnBase.x), -Infinity);
  const columns = Math.max(1, ...slots.map((s) => s.column + 1));
  const pitch = columns > 1 ? (last - first) / (columns - 1) : 0.42;
  const x = first - pitch / 2 + Math.max(0, Math.min(1, fraction)) * columns * pitch;
  return Math.max(layout.camera.standMinX, Math.min(layout.camera.standMaxX, x));
}

// -------------------------------------------------------------------- DOM

export interface BoothMapDeps {
  readonly layout: BoothLayout;
  /** UI strings (map.*, cell.*). */
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string;
  /** Optional. A tap during the position phase asks for this stand x. */
  readonly onJump?: (standX: number) => void;
}

export interface BoothMapHandle {
  update(input: Omit<MapInput, 'layout'> & { readonly interactive?: boolean }): MapModel;
  destroy(): void;
}

const GLYPH = { unused: '?', used: '✓' } as const;

export function mountBoothMap(root: HTMLElement, deps: BoothMapDeps): BoothMapHandle {
  const doc = root.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'booth-map';
  box.dataset.testid = 'booth-map';
  box.setAttribute('role', 'img');
  const title = doc.createElement('div');
  title.className = 'booth-map-title';
  const grid = doc.createElement('div');
  grid.className = 'booth-map-grid';
  const frame = doc.createElement('div');
  frame.className = 'booth-map-view';
  frame.setAttribute('aria-hidden', 'true');
  const body = doc.createElement('div');
  body.className = 'booth-map-body';
  body.append(grid, frame);
  box.append(title, body);
  root.appendChild(box);

  let cols = 0;
  let tiles: HTMLElement[] = [];
  let interactive = false;

  const build = (model: MapModel) => {
    cols = model.columns;
    grid.replaceChildren();
    grid.style.setProperty('--bm-cols', String(model.columns));
    tiles = model.cells.map(() => {
      const tile = doc.createElement('div');
      tile.className = 'bm-tile';
      const pip = doc.createElement('span');
      pip.className = 'bm-pip';
      const mark = doc.createElement('span');
      mark.className = 'bm-mark';
      tile.append(pip, mark);
      grid.appendChild(tile);
      return tile;
    });
  };

  const onTap = (e: MouseEvent) => {
    if (!interactive || !deps.onJump) return;
    const rect = grid.getBoundingClientRect();
    if (rect.width <= 0) return;
    deps.onJump(standXForFraction(deps.layout, (e.clientX - rect.left) / rect.width));
  };
  box.addEventListener('click', onTap);

  return {
    update(input) {
      const model = boothMapModel({ ...input, layout: deps.layout });
      if (cols !== model.columns) build(model);
      interactive = input.interactive === true;
      box.classList.toggle('booth-map-live', interactive && !!deps.onJump);
      title.textContent = deps.t('map.title');
      const label = deps.t('map.label', { from: model.view.fromColumn, to: model.view.toColumn });
      box.setAttribute('aria-label', `${label} ${deps.t('map.prize')}: ${model.prizeCount}. ${deps.t('cell.used')}: ${model.usedCount}.`);
      model.cells.forEach((c, i) => {
        const tile = tiles[i]!;
        tile.dataset.prize = c.hasPrize ? '1' : '0';
        tile.dataset.cell = c.cellState ?? 'none';
        tile.dataset.outlined = c.outlined ? '1' : '0';
        const pip = tile.children[0] as HTMLElement;
        const mark = tile.children[1] as HTMLElement;
        pip.textContent = c.hasPrize ? (c.outlined ? '◆' : '●') : '○';
        mark.textContent = c.cellState ? GLYPH[c.cellState] : '';
        tile.title = [c.hasPrize ? deps.t('map.prize') : deps.t('map.empty'), c.cellState === 'used' ? deps.t('map.cellUsed') : c.cellState === 'unused' ? deps.t('map.cellUnused') : '']
          .filter(Boolean)
          .join(' / ');
      });
      frame.style.left = `${(model.view.left * 100).toFixed(2)}%`;
      frame.style.width = `${(model.view.width * 100).toFixed(2)}%`;
      return model;
    },
    destroy() {
      box.removeEventListener('click', onTap);
      box.remove();
    },
  };
}
