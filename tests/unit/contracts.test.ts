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
  BOOTH_LAYOUT_V2,
  CELL_IDS_V2,
  SLOT_IDS_V2,
  cellForSlot,
  cellIdOf,
  isAmmoBalanced,
  isBackgroundCellId,
  isEffectGroupId,
  isEffectId,
  isExpandedRunState,
  isPairSetId,
  isQuestionId,
  isSeriesId,
  legacySlotPosition,
  slotIdV2,
  slotRowColumn,
  type FinalResult,
  type ScoreLedgerEntry,
  type ShotId,
  type PrizeInstanceId,
  type PrizeTypeId,
  type RuntimeCatalog,
  type PrizeRuntimeConfig,
  type SetRuntimeConfig,
  type SetId,
  type RunState,
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
      { type: 'ANSWER_SHOPKEEPER', shotId: 's03', questionId: 'Q017', choice: 'B' },
      { type: 'ORDER', accept: true },
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
    [{ type: 'ORDER', accept: 'yes' }, 'an order answer is a boolean'],
    [{ type: 'ORDER', accept: true, ammo: 2 }, 'an order cannot carry ammo'],
    [{ type: 'FIRE', ammo: 20 }, 'ammo cannot be set'],
    [{ type: 'STOP_LOAD', barValue: 0.5 }, 'load quality is computed by the core, not sent by the UI'],
    [{ type: 'AIM', yaw: Number.NaN, pitch: 0 }, 'non-finite numbers are rejected'],
    [{ type: 'AIM', yaw: 0 }, 'missing fields are rejected'],
    [{ type: 'SET_POSITION', x: '0.1' }, 'wrong field types are rejected'],
    [{ type: 'PAUSE', reason: 'boredom' }, 'unknown pause reasons are rejected'],
    [{ type: 'ANSWER_SHOPKEEPER', shotId: 's03', questionId: 'Q017', choice: 'B', effectId: 'FX001' }, 'an answer cannot choose its effect'],
    [{ type: 'ANSWER_SHOPKEEPER', shotId: 's03', questionId: 'Q017', choice: 'B', score: 50 }, 'an answer cannot carry points'],
    [{ type: 'ANSWER_SHOPKEEPER', shotId: 's03', questionId: 'Q017', choice: 'B', targetId: 'i0001' }, 'an answer cannot pick a target'],
    [{ type: 'ANSWER_SHOPKEEPER', shotId: 's03', questionId: 'Q017', choice: 'C' }, 'only A or B'],
    [{ type: 'ANSWER_SHOPKEEPER', shotId: 's03', questionId: 'FX001', choice: 'A' }, 'question id format'],
    [{ type: 'ANSWER_SHOPKEEPER', shotId: 'shot-3', questionId: 'Q001', choice: 'A' }, 'shot id format'],
    [{ type: 'ANSWER_SHOPKEEPER', questionId: 'Q001', choice: 'A' }, 'shot id is required'],
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

describe('layout v1.1: shopkeeper placement', () => {
  const L = BOOTH_LAYOUT;
  const overlaps = (a: { center: { x: number; y: number; z: number }; halfExtents: { x: number; y: number; z: number } }, b: typeof a) =>
    Math.abs(a.center.x - b.center.x) < a.halfExtents.x + b.halfExtents.x &&
    Math.abs(a.center.y - b.center.y) < a.halfExtents.y + b.halfExtents.y &&
    Math.abs(a.center.z - b.center.z) < a.halfExtents.z + b.halfExtents.z;

  it('no shopkeeper part overlaps a shelf board, a slot, a device or the walls', () => {
    const solids = [
      ...L.surfaces.filter((s) => s.id !== 'floor').map((s) => s.box),
      ...L.slots.map((s) => s.occupancyBox),
      ...L.devices.map((d) => d.box),
    ];
    for (const part of L.shopkeeper) for (const b of solids) expect(overlaps(part.box, b), part.part).toBe(false);
  });

  it('no device sits directly behind the shopkeeper body (it would be unreachable and hidden)', () => {
    const body = L.shopkeeper.find((p) => p.part === 'body')!.box;
    for (const d of L.devices) {
      const behind = d.box.center.z < body.center.z && Math.abs(d.box.center.x - body.center.x) < body.halfExtents.x + d.box.halfExtents.x;
      expect(behind, d.deviceId).toBe(false);
    }
  });
});

describe('expanded gameplay ids (D34-D37, EG01)', () => {
  it('accepts the old and the new set/slot ids and keeps the kinds apart', () => {
    expect(isSetId('S001')).toBe(true);
    expect(isSetId('PAIR001')).toBe(true);
    expect(isSetId('PAIR300')).toBe(true);
    expect(isPairSetId('PAIR042')).toBe(true);
    expect(isPairSetId('S042')).toBe(false);
    expect(isSetId('SER01')).toBe(false); // a series is never a set
    expect(isSlotId('t0c0')).toBe(true);
    expect(isSlotId('slot-r1-c01')).toBe(true);
    expect(isSlotId('slot-r3-c12')).toBe(true);
    for (const bad of ['slot-r0-c01', 'slot-r4-c01', 'slot-r1-c00', 'slot-r1-c13', 'slot-r1-c1', 'cell-r1-c01']) expect(isSlotId(bad), bad).toBe(false);
    expect(isBackgroundCellId('cell-r2-c07')).toBe(true);
    expect(isBackgroundCellId('slot-r2-c07')).toBe(false);
    expect(isQuestionId('Q200')).toBe(true);
    expect(isEffectId('FX100')).toBe(true);
    expect(isSeriesId('SER20')).toBe(true);
    expect(isEffectGroupId('CHAOS')).toBe(true);
    expect(isEffectGroupId('chaos')).toBe(false);
    expect(slotIdV2(1, 1)).toBe('slot-r1-c01');
    expect(cellIdOf(3, 12)).toBe('cell-r3-c12');
  });
});

describe('booth layout v2 contract (D36/D37, prototype)', () => {
  const L = BOOTH_LAYOUT_V2;
  const cells = L.backgroundCells ?? [];

  it('has 36 unique slots r1..r3 × c01..c12 and one cell behind each, in the same order', () => {
    expect(L.slotModel).toBe('v2-36');
    expect(L.slots).toHaveLength(36);
    expect(new Set(SLOT_IDS_V2).size).toBe(36);
    expect(cells).toHaveLength(36);
    expect(new Set(CELL_IDS_V2).size).toBe(36);
    L.slots.forEach((s, i) => {
      const c = cells[i]!;
      expect(c.slotId).toBe(s.slotId);
      expect(cellForSlot(s.slotId)).toBe(c.cellId);
      expect(slotRowColumn(s.slotId)).toEqual({ row: c.row, column: c.column });
      expect(c.row).toBe(3 - s.tier); // row 1 = top board = tier 2
      expect(c.column).toBe(s.column + 1);
      expect(c.box.center.x).toBeCloseTo(s.spawnBase.x);
    });
    expect(L.slots[0]!.slotId).toBe('slot-r1-c01');
    expect(L.slots[0]!.tier).toBe(2);
    expect(L.slots[35]!.slotId).toBe('slot-r3-c12');
    expect(L.slots[35]!.tier).toBe(0);
  });

  it('puts every slot on its board and every cell on the back wall face, without overlapping cells', () => {
    for (const s of L.slots) {
      const t = L.tiers[s.tier]!;
      expect(s.spawnBase.y).toBeCloseTo(t.topY);
      expect(Math.abs(s.spawnBase.x)).toBeLessThan(t.halfWidth);
    }
    const wall = L.surfaces.find((s) => s.id === 'back-wall')!;
    const wallFront = wall.box.center.z + wall.box.halfExtents.z;
    for (const c of cells) {
      expect(c.box.center.z - c.box.halfExtents.z).toBeCloseTo(wallFront, 6);
      expect(c.faceNormal).toEqual({ x: 0, y: 0, z: 1 });
    }
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i]!.box;
        const b = cells[j]!.box;
        const overlapX = a.halfExtents.x + b.halfExtents.x - Math.abs(a.center.x - b.center.x);
        const overlapY = a.halfExtents.y + b.halfExtents.y - Math.abs(a.center.y - b.center.y);
        expect(overlapX > 1e-9 && overlapY > 1e-9, `${cells[i]!.cellId}/${cells[j]!.cellId}`).toBe(false);
      }
  });

  it('keeps devices, the shopkeeper and hidden targets out of the cell area and inside the active bounds', () => {
    const cellMinX = Math.min(...cells.map((c) => c.box.center.x - c.box.halfExtents.x));
    const cellMaxX = Math.max(...cells.map((c) => c.box.center.x + c.box.halfExtents.x));
    const cellMaxY = Math.max(...cells.map((c) => c.box.center.y + c.box.halfExtents.y));
    const b = L.activeBounds;
    const inside = (p: { x: number; y: number; z: number }) =>
      Math.abs(p.x - b.center.x) <= b.halfExtents.x && Math.abs(p.y - b.center.y) <= b.halfExtents.y && Math.abs(p.z - b.center.z) <= b.halfExtents.z;
    for (const d of L.devices) {
      const outsideX = d.box.center.x + d.box.halfExtents.x < cellMinX || d.box.center.x - d.box.halfExtents.x > cellMaxX;
      expect(outsideX || d.box.center.y - d.box.halfExtents.y > cellMaxY, d.deviceId).toBe(true);
      expect(inside(d.box.center), d.deviceId).toBe(true);
    }
    expect(L.devices.map((d) => d.kind).sort()).toEqual(['ammo', 'bulletType', 'penalty', 'power', 'split', 'transform']);
    // The shopkeeper stands beyond column 12.
    for (const p of L.shopkeeper) {
      expect(p.box.center.x - p.box.halfExtents.x, p.part).toBeGreaterThan(L.tiers[0]!.halfWidth - 1e-9);
      expect(inside(p.box.center)).toBe(true);
    }
    for (const h of L.hiddenTargets) expect(inside(h.box.center)).toBe(true);
    for (const s of L.slots) expect(inside(s.spawnBase)).toBe(true);
  });

  it('lets the stand reach both end columns, and leaves layout v1 untouched', () => {
    expect(L.camera.standMinX).toBeLessThanOrEqual(L.slots[0]!.spawnBase.x);
    expect(L.camera.standMaxX).toBeGreaterThanOrEqual(L.slots[11]!.spawnBase.x);
    expect(BOOTH_LAYOUT.slots).toHaveLength(9);
    expect(BOOTH_LAYOUT.backgroundCells).toBeUndefined();
    expect(legacySlotPosition('t0c0')).toEqual({ row: 3, column: 1 });
    expect(legacySlotPosition('t2c2')).toEqual({ row: 1, column: 3 });
    expect(legacySlotPosition('slot-r1-c01')).toBeNull();
  });
});

describe('expanded run state helpers', () => {
  const base = { schemaVersion: 1, shotsFired: 3, ammo: 9, bonusAmmoTotal: 2 } as unknown as RunState;
  it('checks the ammo balance with ammoLostTotal only for expanded states', () => {
    expect(isAmmoBalanced(base, 10)).toBe(true);
    const expanded = { ...base, schemaVersion: 2, ammo: 8, ammoLostTotal: 1, expansion: {} } as unknown as RunState;
    expect(isExpandedRunState(expanded)).toBe(true);
    expect(isAmmoBalanced(expanded, 10)).toBe(true);
    expect(isAmmoBalanced({ ...expanded, ammoLostTotal: 0 } as RunState, 10)).toBe(false);
    // A v1 state with a stray field is still v1.
    expect(isExpandedRunState({ ...base, ammoLostTotal: 1 } as RunState)).toBe(false);
  });
});
