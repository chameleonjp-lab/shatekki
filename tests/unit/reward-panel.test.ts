/**
 * Plan T3 (P1-P3) and A9: the one big moment per shot, the per-reward lines with real amounts,
 * the progress strip and the order card. Text through the real 15-locale tables.
 */
import { describe, expect, it } from 'vitest';
import { LOCALES, translate, type UiKey } from '../../src/i18n';
import { momentCue, orderCardModel, rewardCardModel, rewardLine, rewardStripModel, shotMoment, mountRewardPanel, type ShotMomentInput } from '../../src/ui/reward-panel';
import type { RewardOutcome, RewardViewState, SetId } from '../../src/contracts';
import { fakeRoot } from './fake-dom';

const t = (k: string, p?: Readonly<Record<string, string | number>>) => translate('ja', k as UiKey, p);
const base: ShotMomentInput = { collected: 0, completedSets: [], freshSets: [], firedWithLastCork: false, ammoAfter: 5, runEnded: false, rewards: [] };
const out = (o: Partial<RewardOutcome>): RewardOutcome => ({ id: 'A1', key: 'k', shotNumber: 1, offered: 2, granted: 2, ...o });

describe('one big moment per shot (P1-P3 priority)', () => {
  it('first set discovery > continuing from the last cork > several prizes', () => {
    const all = { ...base, collected: 3, completedSets: ['PAIR001' as SetId], freshSets: ['PAIR001' as SetId], firedWithLastCork: true, ammoAfter: 2 };
    expect(shotMoment(all).big).toBe('setFirst');
    expect(shotMoment({ ...all, freshSets: [] }).big).toBe('continue');
    expect(shotMoment({ ...all, freshSets: [], firedWithLastCork: false }).big).toBe('multiTake');
    expect(shotMoment({ ...base, collected: 1 }).big).toBeNull();
  });

  it('continues only when the last cork really came back; a cap on the last cork is a calm card', () => {
    expect(shotMoment({ ...base, firedWithLastCork: true, ammoAfter: 0, runEnded: true }).big).toBeNull();
    const capped = shotMoment({ ...base, firedWithLastCork: true, ammoAfter: 0, runEnded: true, rewards: [out({ granted: 0 })] });
    expect(capped).toEqual({ big: null, capped: true });
  });

  it('plays exactly one cue: the moment, or the take sound for a single prize', () => {
    expect(momentCue({ big: 'setFirst', capped: false }, 3)).toEqual({ cue: 'setDiscovered' });
    expect(momentCue({ big: 'continue', capped: false }, 0)).toEqual({ cue: 'lastShotContinue' });
    expect(momentCue({ big: 'multiTake', capped: false }, 4)).toEqual({ cue: 'takeTier', count: 4 });
    expect(momentCue({ big: null, capped: false }, 1)).toEqual({ cue: 'takeTier', count: 1 });
    expect(momentCue({ big: null, capped: false }, 0)).toBeNull();
  });
});

describe('reward lines and cards', () => {
  it('reads the real amount: full, partial with the cap, and nothing at the cap', () => {
    expect(rewardLine(out({}), t).text).toBe(t('reward.granted', { n: 2 }));
    expect(rewardLine(out({ offered: 3, granted: 1 }), t).text).toBe(t('reward.partial', { n: 1, req: 3 }));
    expect(rewardLine(out({ granted: 0 }), t).text).toBe(t('reward.capped'));
    expect(rewardLine(out({ id: 'A5' }), t).name).toBe('最後の一発の二重丸');
  });

  it('names every set, marks the first-time ones, and says "2組完成" for several', () => {
    const m = rewardCardModel({ ...base, collected: 4, completedSets: ['PAIR001' as SetId, 'S001' as SetId], freshSets: ['S001' as SetId], setName: (id) => `name-${id}` }, t);
    expect(m.big).toBe('setFirst');
    expect(m.headline).toBe(t('reward.set.many', { n: 2 }));
    expect(m.sets).toEqual([{ name: 'name-PAIR001', fresh: false }, { name: 'name-S001', fresh: true }]);
  });

  it('shows "あと3発" when the last cork comes back three', () => {
    const m = rewardCardModel({ ...base, firedWithLastCork: true, ammoAfter: 3, rewards: [out({ id: 'A5', offered: 3, granted: 3 })], setName: String }, t);
    expect(m.headline).toBe('あと3発！');
    expect(m.lines.map((l) => `${l.name}: ${l.text}`)).toEqual(['最後の一発の二重丸: 弾+3']);
  });

  it('has every reward text in all 15 locales, with no placeholder left', () => {
    const keys = ['reward.card.title', 'reward.granted', 'reward.partial', 'reward.capped', 'reward.set.first', 'reward.set.many', 'reward.continue', 'reward.continue.none', 'reward.take.many', 'order.title', 'order.body', 'order.accept', 'order.decline', 'result.best.title', 'result.best.line', 'result.best.none', ...Array.from({ length: 10 }, (_, i) => `reward.name.A${i + 1}`)];
    for (const locale of LOCALES) {
      for (const k of keys) {
        const s = translate(locale, k as UiKey, { n: 2, req: 3, name: 'X', shots: 3, shot: 4, prizes: 2, sets: 1, points: 30, left: 2, lit: 1, total: 3, center: 3, outer: 1 });
        expect(s, `${locale} ${k}`).toBeTruthy();
        expect(s, `${locale} ${k}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

const view = (over: Partial<RewardViewState> = {}): RewardViewState => ({
  bagInstanceId: null,
  bagOffer: 2,
  target: null,
  order: { typeId: 'P034' as never, status: 'offered', acceptedAfterShots: null, doneOnShot: null },
  orderShotsLeft: null,
  lanternsLit: [0],
  lanternZones: 3,
  prizesWon: 1,
  nextStamp: 2,
  piggyDeposits: 0,
  enabled: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'],
  ...over,
});

describe('strip and order card', () => {
  it('shows the bag count, next stamp, lanterns, piggy bank and an accepted order with shots left', () => {
    const chips = rewardStripModel(view({ order: { typeId: 'P034' as never, status: 'accepted', acceptedAfterShots: 0, doneOnShot: null }, orderShotsLeft: 2 }), t, () => 'ライオン').chips;
    expect(chips.map((c) => c.text)).toEqual(['袋 1個', 'スタンプまで あと1個', '提灯 1/3', '貯金箱 0', '注文：ライオン（あと2射）']);
  });

  it('offers the order only while it is open, with the deadline and reward written out', () => {
    const m = orderCardModel(view(), 3, 2, t, () => 'ライオンのぬいぐるみ');
    expect(m?.body).toBe('ライオンのぬいぐるみを3射以内に1個取ると、弾+2。断っても損はありません。');
    expect(orderCardModel(view({ order: { typeId: 'P034' as never, status: 'declined', acceptedAfterShots: null, doneOnShot: null } }), 3, 2, t, String)).toBeNull();
    expect(orderCardModel(view({ enabled: ['A1', 'A5'] }), 3, 2, t, String)).toBeNull();
  });

  it('a double tap answers the order once', () => {
    const root = fakeRoot();
    let calls = 0;
    const panel = mountRewardPanel(root as never, { t, prizeName: String, onOrder: () => (calls++, true), setTimeout: () => 0, clearTimeout: () => undefined });
    panel.update(view(), { shots: 3, amount: 2 });
    const accept = root.byTestId('order-accept');
    accept.dispatch('click');
    accept.dispatch('click');
    expect(calls).toBe(1);
    panel.destroy();
  });
});
