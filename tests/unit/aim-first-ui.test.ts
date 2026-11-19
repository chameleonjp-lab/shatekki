import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAimFirstControls } from '../../src/ui/controls/aim-first-panel';
import { mountTalkPanel } from '../../src/ui/shopkeeper-talk';
import { SpeechScheduler } from '../../src/ui/shopkeeper-speech';
import { aimFirstCardModel } from '../../src/ui/aim-first-card';
import { SPEECH_LINES, afText, speechText } from '../../src/i18n/stall-speech';
import { LOCALES } from '../../src/i18n/locales';
import { FakeDocument, FakeElement } from './fake-dom';
import type { AimFirstViewState, RunState, ShotSummary, TalkOutcome, ViewState } from '../../src/contracts';

// ------------------------------------------------------------------ fake window

class FakeWin {
  frames = new Map<number, (ts: number) => void>();
  next = 1;
  now = 0;
  listeners = new Map<string, Set<(e: unknown) => void>>();
  requestAnimationFrame(fn: (ts: number) => void): number {
    const id = this.next++;
    this.frames.set(id, fn);
    return id;
  }
  cancelAnimationFrame(id: number): void {
    this.frames.delete(id);
  }
  /** Run animation frames for `ms` at 60 Hz. */
  run(ms: number): void {
    const end = this.now + ms;
    while (this.now < end) {
      this.now += 1000 / 60;
      const due = [...this.frames.entries()];
      this.frames.clear();
      for (const [, fn] of due) fn(this.now);
    }
  }
  addEventListener(t: string, fn: (e: unknown) => void): void {
    if (!this.listeners.has(t)) this.listeners.set(t, new Set());
    this.listeners.get(t)!.add(fn);
  }
  removeEventListener(t: string, fn: (e: unknown) => void): void {
    this.listeners.get(t)?.delete(fn);
  }
  fire(t: string): void {
    for (const fn of this.listeners.get(t) ?? []) fn({ type: t });
  }
  setTimeout = (fn: () => void, ms: number) => setTimeout(fn, ms);
  clearTimeout = (id: ReturnType<typeof setTimeout>) => clearTimeout(id);
}

function env() {
  const win = new FakeWin();
  const doc = new FakeDocument() as FakeDocument & { defaultView: FakeWin; visibilityState: string; addEventListener: FakeWin['addEventListener']; removeEventListener: FakeWin['removeEventListener'] };
  const docListeners = new FakeWin();
  doc.defaultView = win;
  doc.visibilityState = 'visible';
  doc.addEventListener = docListeners.addEventListener.bind(docListeners);
  doc.removeEventListener = docListeners.removeEventListener.bind(docListeners);
  const root = doc.createElement('div');
  return { win, doc, root, docListeners };
}

const ZONES = [
  { tier: 'perfect' as const, min: 0.8, max: 0.9 },
  { tier: 'good' as const, min: 0.7, max: 1 },
  { tier: 'normal' as const, min: 0.5, max: 1 },
  { tier: 'weak' as const, min: 0, max: 1 },
];
function snap(phase: RunState['phase'], over: Partial<RunState> = {}, view: Partial<ViewState> = {}) {
  const state = { phase, ammo: 10, bonusAmmoTotal: 0, score: 0, standX: 0, aim: { yaw: 0, pitch: 0 }, ...over } as RunState;
  const aimFirst: AimFirstViewState = { powerZoneWidthMult: 1, zones: ZONES, aim: state.aim, talk: { blocked: null, ammoBlocked: null, ammoOffer: 1, powerZoneWidthMult: 0.85, used: null } };
  return { state, view: { phase, standX: 0, effectiveAim: state.aim, loadingBar: phase === 'loading' ? 0.5 : null, paused: false, ballistic: {} as never, aimFirst, ...view } as ViewState, maxBonusAmmo: 10 };
}

function panel() {
  const e = env();
  const sent: Record<string, unknown>[] = [];
  let x = 0;
  const commits = vi.fn();
  const h = mountAimFirstControls(e.root as unknown as HTMLElement, {
    dispatch: (c) => {
      sent.push(c as Record<string, unknown>);
      if ((c as { type: string }).type === 'SET_POSITION') x = (c as { x: number }).x;
      return true;
    },
    commitAim: commits,
    currentAim: () => ({ yaw: 0, pitch: 0 }),
    currentStandX: () => x,
    onRetry: () => undefined,
    onTalk: () => undefined,
    t: (k) => k,
    move: { step: 0.14, holdDelayMs: 300, holdSpeed: 1.4, min: -2.65, max: 2.65 },
  });
  h.update(snap('aiming'), false);
  const el = (id: string) => (e.root as unknown as FakeElement).byTestId(id);
  return { ...e, h, sent, commits, el, x: () => x, setX: (v: number) => (x = v) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('r007 controls: move, aim, 撃つ → 発射', () => {
  it('a tap on ▶ moves one 0.14 m step on release and saves once', () => {
    const p = panel();
    p.el('btn-right').dispatch('pointerdown', { pointerId: 1 });
    expect(p.sent).toEqual([]); // nothing until it is released as a tap
    p.el('btn-right').dispatch('pointerup', { pointerId: 1 });
    expect(p.sent).toEqual([{ type: 'SET_POSITION', x: 0.14 }]);
    expect(p.commits).toHaveBeenCalledTimes(1);
  });

  it('holding glides at about 1.4 m/s after 300 ms, without the tap step, then saves once on release', () => {
    const p = panel();
    p.el('btn-left').dispatch('pointerdown', { pointerId: 2 });
    vi.advanceTimersByTime(300);
    p.win.run(1000);
    p.el('btn-left').dispatch('pointerup', { pointerId: 2 });
    expect(p.x()).toBeLessThan(-1.2);
    expect(p.x()).toBeGreaterThan(-1.5);
    expect(p.commits).toHaveBeenCalledTimes(1);
    // the glide stops at the end of the stall
    p.el('btn-left').dispatch('pointerdown', { pointerId: 3 });
    vi.advanceTimersByTime(300);
    p.win.run(4000);
    expect(p.x()).toBe(-2.65);
    p.el('btn-left').dispatch('pointercancel', { pointerId: 3 });
    expect(p.commits).toHaveBeenCalledTimes(2);
  });

  it('a second finger, a blur and hiding the page never leave a hold running', () => {
    const p = panel();
    p.el('btn-right').dispatch('pointerdown', { pointerId: 1 });
    p.el('btn-left').dispatch('pointerdown', { pointerId: 2 }); // ignored: one gesture at a time
    vi.advanceTimersByTime(300);
    p.win.fire('blur');
    p.win.run(1000);
    expect(p.x()).toBe(0);
    expect(p.sent.filter((c) => c.type === 'SET_POSITION')).toEqual([]);
    expect(p.commits).toHaveBeenCalledTimes(1);
  });

  it('the first press opens the gauge; it must be released before a new press fires; key repeat never fires', () => {
    const p = panel();
    const btn = p.el('btn-fire');
    btn.dispatch('pointerdown', { pointerId: 7, isPrimary: true });
    expect(p.sent).toEqual([{ type: 'OPEN_GAUGE' }]);
    p.h.update(snap('loading'), false);
    btn.dispatch('pointerdown', { pointerId: 7, isPrimary: true }); // still the same press
    expect(p.sent).toHaveLength(1);
    btn.dispatch('pointerup', { pointerId: 7 });
    btn.dispatch('keydown', { key: 'Enter', repeat: true, preventDefault() {} });
    expect(p.sent).toHaveLength(1);
    btn.dispatch('pointerdown', { pointerId: 8, isPrimary: true });
    expect(p.sent.at(-1)).toEqual({ type: 'FIRE' });
    expect(btn.textContent).toBe('af.fire');
  });

  it('while the gauge is open the move buttons and the pad do nothing; 照準に戻る cancels', () => {
    const p = panel();
    p.h.update(snap('loading'), false);
    expect(p.el('btn-left').disabled).toBe(true);
    p.el('aim-pad').dispatch('pointerdown', { pointerId: 4, clientX: 0, clientY: 0 });
    p.el('aim-pad').dispatch('pointermove', { pointerId: 4, clientX: 50, clientY: 0 });
    expect(p.sent.filter((c) => c.type === 'AIM')).toEqual([]);
    p.el('btn-cancel-gauge').dispatch('click');
    expect(p.sent.at(-1)).toEqual({ type: 'CANCEL_GAUGE' });
  });

  it('while saving nothing can be pressed (no stacked shots)', () => {
    const p = panel();
    p.h.update(snap('loading'), true);
    expect(p.el('btn-fire').disabled).toBe(true);
    expect(p.el('btn-cancel-gauge').disabled).toBe(true);
    expect(p.el('hint').textContent).toBe('af.hint.saving');
  });

  it('a drag aims relative to the current aim and saves once when the finger lifts', () => {
    const p = panel();
    const pad = p.el('aim-pad');
    pad.dispatch('pointerdown', { pointerId: 9, clientX: 100, clientY: 100 });
    pad.dispatch('pointermove', { pointerId: 9, clientX: 150, clientY: 80 });
    pad.dispatch('pointermove', { pointerId: 9, clientX: 160, clientY: 80 });
    expect(p.commits).not.toHaveBeenCalled();
    pad.dispatch('pointerup', { pointerId: 9 });
    expect(p.sent.filter((c) => c.type === 'AIM')).toHaveLength(2);
    expect(p.commits).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------ talk panel

function talk(over: Partial<AimFirstViewState['talk']> = {}): AimFirstViewState['talk'] {
  return { blocked: null, ammoBlocked: null, ammoOffer: 1, powerZoneWidthMult: 0.85, used: null, ...over };
}

describe('r007 talk panel', () => {
  it('opening and closing never choose; the ammo choice shows its cost before choosing', () => {
    const root = new FakeDocument().createElement('div');
    const choose = vi.fn(() => true);
    const p = mountTalkPanel(root as unknown as HTMLElement, { t: (k, prm) => (prm ? `${k}:${JSON.stringify(prm)}` : k), choose, describe: () => 'done' });
    p.open(talk());
    expect(p.isOpen).toBe(true);
    expect(root.byTestId('talk-ammo').textContent).toContain('af.talk.ammo.note');
    expect(root.byTestId('talk-ammo').textContent).toContain('0.85');
    root.byTestId('talk-close').dispatch('click');
    expect(p.isOpen).toBe(false);
    expect(choose).not.toHaveBeenCalled();
  });

  it('a blocked ammo choice is disabled with the reason; the hint stays possible', () => {
    const root = new FakeDocument().createElement('div');
    const p = mountTalkPanel(root as unknown as HTMLElement, { t: (k) => k, choose: () => true, describe: () => '' });
    p.open(talk({ ammoBlocked: 'ammoCap', ammoOffer: 0 }));
    expect(root.byTestId('talk-ammo').disabled).toBe(true);
    expect(root.byTestId('talk-ammo-why').textContent).toBe('af.talk.ammo.cap');
    expect(root.byTestId('talk-hint').disabled).toBe(false);
    p.update(talk({ ammoBlocked: 'zoneReserved' }));
    expect(root.byTestId('talk-ammo-why').textContent).toBe('af.talk.ammo.reserved');
  });

  it('rapid taps choose once; the shown result is the saved outcome read back', async () => {
    vi.useRealTimers();
    const root = new FakeDocument().createElement('div');
    let resolve!: (v: boolean) => void;
    const choose = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const outcome: TalkOutcome = { choice: 'ammo', afterShot: 0, ammoRequested: 1, ammoGranted: 1, powerZoneWidthMult: 0.85, hint: null };
    const p = mountTalkPanel(root as unknown as HTMLElement, { t: (k) => k, choose, describe: (o) => `+${o.ammoGranted}` });
    p.open(talk());
    root.byTestId('talk-ammo').dispatch('click');
    root.byTestId('talk-ammo').dispatch('click');
    root.byTestId('talk-hint').dispatch('click');
    expect(choose).toHaveBeenCalledTimes(1);
    p.update(talk({ used: outcome, blocked: 'used' }));
    resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(root.byTestId('talk-result').textContent).toBe('+1');
  });

  it('a failed save leaves the right unused (the panel stays open, nothing is shown as received)', async () => {
    vi.useRealTimers();
    const root = new FakeDocument().createElement('div');
    const p = mountTalkPanel(root as unknown as HTMLElement, { t: (k) => k, choose: async () => false, describe: () => 'x' });
    p.open(talk());
    root.byTestId('talk-hint').dispatch('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(p.isOpen).toBe(true);
    expect(root.byTestId('talk-result').hidden).toBe(true);
    expect(root.byTestId('talk-hint').disabled).toBe(false);
  });

  it('does not open when the right is used or blocked', () => {
    const root = new FakeDocument().createElement('div');
    const p = mountTalkPanel(root as unknown as HTMLElement, { t: (k) => k, choose: () => true, describe: () => '' });
    p.open(talk({ blocked: 'used' }));
    expect(p.isOpen).toBe(false);
  });
});

// ------------------------------------------------------------------ speech

const TIMING = { firstSec: 6, intervalSec: 12, showSec: 4.5, recentWindow: 5 };
function run(s: SpeechScheduler, sec: number, calm = true, conds = new Set<never>()) {
  const said: { at: number; id: string }[] = [];
  let t = 0;
  for (let i = 0; i < Math.round(sec * 60); i++) {
    t += 1 / 60;
    const r = s.tick(1 / 60, calm, conds);
    if (r.start) said.push({ at: Math.round(s.calmSeconds * 10) / 10, id: r.start });
  }
  return said;
}

describe('r007 speech bubbles', () => {
  it('the first line comes after 6 s of calm aiming, then one every 12 s, each shown about 4.5 s', () => {
    const s = new SpeechScheduler(42, TIMING, SPEECH_LINES);
    const said = run(s, 31);
    expect(said.map((x) => x.at)).toEqual([6, 18, 30]);
    const t = new SpeechScheduler(42, TIMING, SPEECH_LINES);
    run(t, 6.05);
    let shown = 0;
    for (let i = 0; i < 600; i++) if (t.tick(1 / 60, true, new Set()).showing) shown++;
    expect(shown / 60).toBeGreaterThan(4.3);
    expect(shown / 60).toBeLessThan(4.6);
  });

  it('time outside calm aiming never counts and never releases a backlog', () => {
    const s = new SpeechScheduler(7, TIMING, SPEECH_LINES);
    run(s, 5);
    expect(run(s, 60, false)).toEqual([]); // paused, flying, question, talk, hidden...
    const after = run(s, 1.2);
    expect(after).toHaveLength(1); // only the one that was due at 6 s of calm time
    expect(s.tick(30, true, new Set()).start).toBeNull(); // one huge frame adds at most 0.25 s
  });

  it('never repeats one of the last five, and only draws lines whose condition holds', () => {
    const s = new SpeechScheduler(3, { ...TIMING, firstSec: 0.1, intervalSec: 0.1 }, SPEECH_LINES);
    const said = run(s, 30).map((x) => x.id);
    for (let i = 5; i < said.length; i++) expect(said.slice(i - 5, i)).not.toContain(said[i]);
    const conditional = new Set(SPEECH_LINES.filter((l) => l.when !== 'always').map((l) => l.id));
    expect(said.some((id) => conditional.has(id))).toBe(false);
    const withLast = run(new SpeechScheduler(3, { ...TIMING, firstSec: 0.1, intervalSec: 0.1 }, SPEECH_LINES), 60, true, new Set(['lastCork'] as never[])).map((x) => x.id);
    expect(withLast).toContain('K093');
  });

  it('the order of lines does not depend on the language; every line has text in every locale', () => {
    const a = run(new SpeechScheduler(99, TIMING, SPEECH_LINES), 100).map((x) => x.id);
    const b = run(new SpeechScheduler(99, TIMING, SPEECH_LINES), 100).map((x) => x.id);
    expect(a).toEqual(b);
    expect(SPEECH_LINES).toHaveLength(100);
    expect(new Set(SPEECH_LINES.map((l) => l.id)).size).toBe(100);
    for (const loc of LOCALES) for (const l of SPEECH_LINES) expect(speechText(loc, l.id), `${loc}/${l.id}`).not.toBe(l.id);
    for (const loc of LOCALES) expect(afText(loc, 'af.talk.open')).not.toBe('af.talk.open');
  });
});

// ------------------------------------------------------------------ card

const TX = { t: (k: string, p?: Readonly<Record<string, string | number>>) => (p ? `${k}${JSON.stringify(p)}` : k), prizeName: (id: string) => `<${id}>`, setName: (id: string) => `[${id}]` };
function summary(over: Partial<ShotSummary> = {}): ShotSummary {
  return {
    runId: 'r' as never, shotId: 's01' as never, shotNumber: 1, collected: [], chainCount: 0, newlyCompletedSets: [], bonusAmmoRequested: 0, bonusAmmoGranted: 0, devicesActivated: [], transforms: [],
    ledger: { shotId: 's01' as never, scoreBefore: 100, prizePoints: 0, trickPoints: 0, setPoints: 0, firstHitPoints: 0, nominalPenalty: 0, appliedPenalty: 0, scoreAfter: 100, items: [] },
    endedByLimit: false, prizeOutcomes: [], touchedFirstHitTargets: [], ammoAfter: 5, runEnded: false, effects: [], ...over,
  };
}

describe('r007 shot card (from the confirmed summary only)', () => {
  it('a shot that touched nothing says which way it went and how to aim next', () => {
    for (const exit of ['left', 'right', 'up', 'down', 'back', 'front', 'time', 'unknown'] as const) {
      const m = aimFirstCardModel({ summary: summary({ facts: { representative: null, exit, pushedPrizes: [], unusedNeighbour: false } }), freshSets: [], ammoBeforeShot: 6 }, TX);
      expect(m.kind).toBe('line');
      expect(m.headline).toBe(`af.miss.${exit}`);
    }
  });

  it('a used cell or a pushed prize is described as what happened', () => {
    const used = aimFirstCardModel({ summary: summary({ facts: { representative: { kind: 'cell', cellId: 'cell-r1-c01' as never, activated: false }, exit: null, pushedPrizes: [], unusedNeighbour: true } }), freshSets: [], ammoBeforeShot: 6 }, TX);
    expect(used.headline).toBe('af.fact.usedCell.near');
    const pushed = aimFirstCardModel({ summary: summary({ facts: { representative: { kind: 'prize', instanceId: 'i0001' as never, typeId: 'P009' as never, collected: false }, exit: null, pushedPrizes: ['P009' as never], unusedNeighbour: false } }), freshSets: [], ammoBeforeShot: 6 }, TX);
    expect(pushed.headline).toBe('af.fact.prize{"name":"<P009>"}');
  });

  it('two sets at once: one card with each name and points, the total score, and the real ammo gained from every source', () => {
    const s = summary({
      newlyCompletedSets: ['PAIR001', 'S010'] as never,
      chainCount: 2,
      collected: [{ instanceId: 'i1', typeId: 'P001', shotId: 's01' }, { instanceId: 'i2', typeId: 'P002', shotId: 's01' }] as never,
      bonusAmmoGranted: 3,
      effects: [{ requestId: 'x' as never, source: { kind: 'cell', cellId: 'c' as never }, effectId: 'FX001' as never, outcome: 'applied', reason: null, ammoDelta: 1, ammoRequested: 1, targets: [] }],
      ledger: { shotId: 's01' as never, scoreBefore: 100, prizePoints: 20, trickPoints: 0, setPoints: 150, firstHitPoints: 0, nominalPenalty: 0, appliedPenalty: 0, scoreAfter: 270, items: [{ kind: 'set', refId: 'PAIR001', points: 50 }, { kind: 'set', refId: 'S010', points: 100 }] },
    });
    const m = aimFirstCardModel({ summary: s, freshSets: ['PAIR001'] as never, ammoBeforeShot: 3 }, TX);
    expect(m.kind).toBe('set');
    expect(m.headline).toBe('af.set.many{"n":2}');
    expect(m.sets).toEqual([{ setId: 'PAIR001', name: '[PAIR001]', points: 50, fresh: true }, { setId: 'S010', name: '[S010]', points: 100, fresh: false }]);
    expect(m.total).toBe('af.set.total{"score":270}');
    expect(m.ammo[0]).toBe('af.ammo.gained{"n":3}');
  });

  it('the last cork that continues is the big moment when no set formed; a cap is shown with its reason', () => {
    const cont = aimFirstCardModel({ summary: summary({ ammoAfter: 2, bonusAmmoGranted: 2 }), freshSets: [], ammoBeforeShot: 1 }, TX);
    expect(cont.kind).toBe('continue');
    const capped = aimFirstCardModel({ summary: summary({ ammoAfter: 0, runEnded: true, parts: [{ part: 'hat', first: true, firstPoints: 30, effect: 'ammo', ammoRequested: 1, ammoGranted: 0, powerZoneWidthMult: null, hint: null, reason: 'noAmmoRoom' }] }), freshSets: [], ammoBeforeShot: 1 }, TX);
    expect(capped.ammo).toContain('af.ammo.capped');
    expect(capped.headline).toContain('af.part.points');
    expect(capped.headline).toContain('af.part.hat.cap');
  });
});
