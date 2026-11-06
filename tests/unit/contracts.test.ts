import { describe, expect, it } from 'vitest';
import {
  BOOTH_LAYOUT,
  GAME_COMMAND_TYPES,
  SIM_EVENT_TYPES,
  SLOT_IDS,
  asPrizeTypeId,
  asSetId,
  catalogValueStatus,
  isOfficialRankingEligible,
  isLedgerEntryConsistent,
  isPrizeTypeId,
  isSetId,
  isSlotId,
  mintId,
  parseCommand,
  slotIdOf,
  type FinalResult,
  type ScoreLedgerEntry,
  type ShotId,
  type PrizeInstanceId,
  type PrizeTypeId,
  type RuntimeCatalog,
  type PrizeRuntimeConfig,
  type SetRuntimeConfig,
  type SetId,
} from '../../src/contracts';

describe('ids: type id and instance id are distinct', () => {
  it('validates the id formats used by the candidate catalog', () => {
    expect(isPrizeTypeId('P001')).toBe(true);
    expect(isPrizeTypeId('P1')).toBe(false);
    expect(isPrizeTypeId('i0001')).toBe(false);
    expect(isSetId('S100')).toBe(true);
    expect(isSetId('P100')).toBe(false);
    expect(isSlotId('t2c1')).toBe(true);
    expect(isSlotId('t3c0')).toBe(false);
    expect(() => asPrizeTypeId('X001')).toThrow();
    expect(() => asSetId('S1')).toThrow();
  });

  it('mints instance ids that are not prize type ids', () => {
    const inst = mintId.instance(7);
    expect(inst).toBe('i0007');
    expect(isPrizeTypeId(inst)).toBe(false);
  });

  it('rejects mixing ids at the type level (checked by tsc)', () => {
    const typeId: PrizeTypeId = asPrizeTypeId('P001');
    const instanceId: PrizeInstanceId = mintId.instance(1);
    // @ts-expect-error a prize type id is not an instance id
    const wrong1: PrizeInstanceId = typeId;
    // @ts-expect-error an instance id is not a prize type id
    const wrong2: PrizeTypeId = instanceId;
    // @ts-expect-error a plain string is not a set id
    const wrong3: SetId = 'S001';
    expect([wrong1, wrong2, wrong3]).toHaveLength(3);
  });
});

describe('parseCommand: UI input is narrowed and cannot carry results', () => {
  it('accepts every defined command', () => {
    const samples: unknown[] = [
      { type: 'SET_POSITION', x: 0.2 },
      { type: 'CONFIRM_POSITION' },
      { type: 'STOP_LOAD' },
      { type: 'AIM', yaw: 0.01, pitch: -0.02 },
      { type: 'FIRE' },
      { type: 'PAUSE', reason: 'hidden' },
      { type: 'RESUME', reason: 'manual' },
      { type: 'ABANDON' },
      { type: 'SKIP_PRESENTATION' },
    ];
    const parsed = samples.map((s) => parseCommand(s));
    expect(parsed.every((p) => p.ok)).toBe(true);
    expect(new Set(parsed.map((p) => (p.ok ? p.command.type : '')))).toEqual(new Set(GAME_COMMAND_TYPES));
  });

  it.each([
    [{ type: 'SETTLE' }, 'settlement cannot be requested by the UI'],
    [{ type: 'SET_SCORE', score: 999 }, 'score cannot be set'],
    [{ type: 'COLLECT', instanceId: 'i0001' }, 'collection cannot be set'],
    [{ type: 'FIRE', score: 999 }, 'extra fields are rejected'],
    [{ type: 'FIRE', ammo: 20 }, 'ammo cannot be set'],
    [{ type: 'STOP_LOAD', barValue: 0.5 }, 'load quality is computed by the core, not sent by the UI'],
    [{ type: 'AIM', yaw: Number.NaN, pitch: 0 }, 'non-finite numbers are rejected'],
    [{ type: 'AIM', yaw: 0 }, 'missing fields are rejected'],
    [{ type: 'SET_POSITION', x: '0.1' }, 'wrong field types are rejected'],
    [{ type: 'PAUSE', reason: 'boredom' }, 'unknown pause reasons are rejected'],
    [null, 'null'],
    ['FIRE', 'strings'],
    [['FIRE'], 'arrays'],
  ] as [unknown, string][])('rejects %j (%s)', (input) => {
    expect(parseCommand(input).ok).toBe(false);
  });
});

describe('booth layout contract', () => {
  const L = BOOTH_LAYOUT;

  it('has 3 tiers × 3 columns = 9 unique slots (decision 02)', () => {
    expect(L.tiers).toHaveLength(3);
    expect(L.slots).toHaveLength(9);
    expect(new Set(SLOT_IDS).size).toBe(9);
    expect(SLOT_IDS).toContain(slotIdOf(0, 0));
    expect(SLOT_IDS).toContain(slotIdOf(2, 2));
  });

  it('places every slot on its tier board and inside the board width', () => {
    for (const s of L.slots) {
      const t = L.tiers[s.tier]!;
      expect(s.spawnBase.y).toBeCloseTo(t.topY);
      expect(Math.abs(s.spawnBase.x)).toBeLessThan(t.halfWidth);
      expect(Math.abs(s.spawnBase.z - t.centerZ)).toBeLessThan(t.depth / 2);
    }
  });

  it('collection height is below the lowest board so resting on a shelf is never collection (AC08)', () => {
    const lowest = Math.min(...L.tiers.map((t) => t.topY - t.thickness));
    expect(L.collectBelowY).toBeLessThan(lowest);
    expect(L.collectBelowY).toBeGreaterThan(0);
  });

  it('upper tiers are further back so a prize falling forward can land on a lower tier (blocking case, decision 30)', () => {
    expect(L.tiers[1]!.centerZ).toBeLessThan(L.tiers[0]!.centerZ);
    expect(L.tiers[2]!.centerZ).toBeLessThan(L.tiers[1]!.centerZ);
    expect(L.tiers[1]!.topY).toBeGreaterThan(L.tiers[0]!.topY);
  });

  it('has one device of each of the six required kinds with unique ids', () => {
    const kinds = L.devices.map((d) => d.kind).sort();
    expect(kinds).toEqual(['ammo', 'bulletType', 'penalty', 'power', 'split', 'transform']);
    expect(new Set(L.devices.map((d) => d.deviceId)).size).toBe(L.devices.length);
  });

  it('has the four candidate shopkeeper parts and at least one hidden target', () => {
    expect(L.shopkeeper.map((p) => p.part).sort()).toEqual(['body', 'fan', 'feet', 'hat']);
    expect(L.hiddenTargets.length).toBeGreaterThan(0);
  });

  it('keeps every collider inside the active bounds (off-screen is still simulated, AC14)', () => {
    const b = L.activeBounds;
    const inside = (c: { x: number; y: number; z: number }) =>
      Math.abs(c.x - b.center.x) <= b.halfExtents.x && Math.abs(c.y - b.center.y) <= b.halfExtents.y && Math.abs(c.z - b.center.z) <= b.halfExtents.z;
    for (const d of L.devices) expect(inside(d.box.center)).toBe(true);
    for (const p of L.shopkeeper) expect(inside(p.box.center)).toBe(true);
    for (const h of L.hiddenTargets) expect(inside(h.box.center)).toBe(true);
    for (const s of L.slots) expect(inside(s.spawnBase)).toBe(true);
  });
});

describe('event and ranking contracts', () => {
  it('lists each simulation event type once', () => {
    expect(new Set(SIM_EVENT_TYPES).size).toBe(SIM_EVENT_TYPES.length);
    expect(SIM_EVENT_TYPES).toContain('impact');
    expect(SIM_EVENT_TYPES).toContain('prizeReachedCollection');
  });

  const base: FinalResult = {
    runId: mintId.run('r1'),
    rulesVersion: 'test',
    valueStatus: 'approved',
    status: 'completed',
    score: 100,
    shotsFired: 10,
    collected: [],
    completedSets: [],
    maxChain: 1,
    ledger: [],
    playerName: 'たろう',
  };

  it('only completed, named, approved-value runs are eligible for the official ranking', () => {
    expect(isOfficialRankingEligible(base)).toBe(true);
    expect(isOfficialRankingEligible({ ...base, status: 'abandoned' })).toBe(false); // decision 27
    expect(isOfficialRankingEligible({ ...base, playerName: null })).toBe(false); // anonymous
    expect(isOfficialRankingEligible({ ...base, valueStatus: 'prototype' })).toBe(false); // 試作値
    expect(isOfficialRankingEligible({ ...base, valueStatus: 'proposed' })).toBe(false);
  });

  it('a catalog containing any prototype value is prototype as a whole', () => {
    const prize = { typeId: asPrizeTypeId('P001'), valueStatus: 'approved' } as PrizeRuntimeConfig;
    const set = { setId: asSetId('S001'), valueStatus: 'prototype' } as SetRuntimeConfig;
    const c: RuntimeCatalog = {
      rulesVersion: 'x',
      prizes: new Map([[prize.typeId, prize]]),
      sets: new Map([[set.setId, set]]),
    };
    expect(catalogValueStatus(c)).toBe('prototype');
    const approved: RuntimeCatalog = { ...c, sets: new Map([[set.setId, { ...set, valueStatus: 'approved' }]]) };
    expect(catalogValueStatus(approved)).toBe('approved');
  });
});

describe('ledger invariant (decision 28: floor 0 per shot, nothing carried over)', () => {
  const shotId = 's01' as ShotId;
  // Test-only numbers from plan Task 09, not adopted game values.
  const entry: ScoreLedgerEntry = {
    shotId,
    scoreBefore: 50,
    prizePoints: 20,
    trickPoints: 0,
    setPoints: 0,
    firstHitPoints: 0,
    nominalPenalty: 100,
    appliedPenalty: 70,
    scoreAfter: 0,
    items: [
      { kind: 'prize', refId: 'i0001', points: 20 },
      { kind: 'penalty', refId: 'dev-penalty-1', points: 100 },
    ],
  };

  it('accepts 50 + 20 - 100 → 0 with applied penalty 70', () => {
    expect(isLedgerEntryConsistent(entry)).toBe(true);
  });
  it('rejects a negative carry-over or a mismatched breakdown', () => {
    expect(isLedgerEntryConsistent({ ...entry, scoreAfter: -30, appliedPenalty: 100 })).toBe(false);
    expect(isLedgerEntryConsistent({ ...entry, appliedPenalty: 100 })).toBe(false);
    expect(isLedgerEntryConsistent({ ...entry, prizePoints: 25 })).toBe(false);
  });
  it('accepts the next shot +30 → 30 (no debt from the previous shot)', () => {
    const next: ScoreLedgerEntry = {
      shotId: 's02' as ShotId,
      scoreBefore: 0,
      prizePoints: 30,
      trickPoints: 0,
      setPoints: 0,
      firstHitPoints: 0,
      nominalPenalty: 0,
      appliedPenalty: 0,
      scoreAfter: 30,
      items: [{ kind: 'prize', refId: 'i0002', points: 30 }],
    };
    expect(isLedgerEntryConsistent(next)).toBe(true);
  });
});
