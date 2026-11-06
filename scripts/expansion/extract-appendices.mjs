#!/usr/bin/env node
// Reproducible extraction of the expanded-gameplay appendices (D34-D37, plan EG01)
// into data/expansion-v2/*.json. Usage: node scripts/expansion/extract-appendices.mjs [--check]
// With --check the script verifies that the committed JSON equals a fresh extraction.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const outDir = join(root, 'data', 'expansion-v2');

const rows = (md, firstCell) =>
  md
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim()))
    .filter((cells) => firstCell.test(cells[0] ?? ''));
const fail = (m) => {
  console.error(`extract-appendices: ${m}`);
  process.exit(1);
};

// ---- pair sets ------------------------------------------------------------
const pairs = rows(read('docs/changes/2026-11-06-pair-sets-300.md'), /^PAIR\d{3}$/).map((c) => {
  if (c.length !== 5) fail(`pair row ${c[0]} has ${c.length} cells`);
  const pid = (s) => /^(P\d{3})\s/.exec(s)?.[1] ?? fail(`bad prize cell in ${c[0]}: ${s}`);
  // c[4] is a designer note, never an in-game hint.
  return { id: c[0], name_ja: c[1], prizeIds: [pid(c[2]), pid(c[3])], designNote_ja: c[4] };
});

// ---- questions + groups ---------------------------------------------------
const qmd = read('docs/changes/2026-11-06-shopkeeper-questions-200.md');
const questions = rows(qmd, /^Q\d{3}$/).map((c) => {
  if (c.length !== 6) fail(`question row ${c[0]} has ${c.length} cells`);
  return { id: c[0], text_ja: c[1], A: { text_ja: c[2], group: c[3] }, B: { text_ja: c[4], group: c[5] } };
});
const groups = rows(qmd, /^(GAIN|RISK|STOCK|GUIDE|MIX|CHAOS)$/).map((c) => {
  const m = /^FX(\d{3})〜FX(\d{3})$/.exec(c[2]) ?? fail(`bad range for ${c[0]}`);
  const from = Number(m[1]);
  const to = Number(m[2]);
  return {
    id: c[0],
    label_ja: c[1],
    effectIds: Array.from({ length: to - from + 1 }, (_, i) => `FX${String(from + i).padStart(3, '0')}`),
  };
});

// ---- series ---------------------------------------------------------------
const emd = read('docs/changes/2026-11-06-effects-100.md');
const series = rows(emd, /^SER\d{2}$/).map((c) => {
  if (c.length !== 7) fail(`series row ${c[0]} has ${c.length} cells`);
  return {
    id: c[0],
    name_ja: c[1],
    theme_ja: c[2],
    prizeIds: [...c[3].matchAll(/P\d{3}/g)].map((m) => m[0]),
    color: (/`(#[0-9A-Fa-f]{6})`/.exec(c[5]) ?? fail(`color ${c[0]}`))[1].toUpperCase(),
    symbol_ja: (/`(\[[^\]]+\])`/.exec(c[6]) ?? fail(`symbol ${c[0]}`))[1],
  };
});

// ---- effects --------------------------------------------------------------
// The operation of each effect is hand-transcribed from effects-100.md section 4 (the
// table prose is not machine-parsable); name and timing are checked against the table.
const sm = (set) => ({ kind: 'shotModifiers', set });
const OPS = {};
const put = (n, op) => {
  OPS[n] = op;
};
put(1, { kind: 'ammoAdd', amount: 1 });
put(2, { kind: 'ammoAdd', amount: 2 });
put(3, { kind: 'ammoAdd', amount: 3 });
put(4, sm({ damageMult: 1.25 }));
put(5, sm({ damageMult: 1.5 }));
put(6, sm({ pushMult: 1.25 }));
put(7, sm({ pushMult: 1.5 }));
put(8, sm({ damageMult: 1.2, pushMult: 1.2 }));
put(9, sm({ damageMult: 1.4, pushMult: 1.4 }));
put(10, sm({ speedMult: 1.1 }));
put(11, sm({ speedMult: 1.2 }));
put(12, sm({ swayMult: 0.75 }));
put(13, sm({ swayMult: 0.5 }));
put(14, sm({ gravityMult: 0.75 }));
put(15, sm({ gravityMult: 0.5 }));
put(16, sm({ bulletType: 'bouncy' }));
put(17, sm({ bulletType: 'heavy' }));
put(18, sm({ splitSpreadMult: 0.75 }));
put(19, sm({ launch: { count: 2, spreadRad: 0.175 } }));
put(20, sm({ extraReflections: 1 }));
put(21, { kind: 'ammoRemove', amount: 1 });
put(22, { kind: 'ammoRemove', amount: 2 });
put(23, { kind: 'ammoRemove', amount: 3 });
put(24, sm({ damageMult: 0.75 }));
put(25, sm({ damageMult: 0.5 }));
put(26, sm({ pushMult: 0.75 }));
put(27, sm({ pushMult: 0.5 }));
put(28, sm({ damageMult: 0.8, pushMult: 0.8 }));
put(29, sm({ speedMult: 0.9 }));
put(30, sm({ speedMult: 0.8 }));
put(31, sm({ gravityMult: 1.25 }));
put(32, sm({ gravityMult: 1.5 }));
put(33, sm({ restitutionMult: 0.85 }));
put(34, sm({ restitutionMult: 0.65 }));
put(35, sm({ swayMult: 1.25 }));
put(36, sm({ swayMult: 1.5 }));
put(37, sm({ loadPeriodMult: 0.85 }));
put(38, sm({ loadPeriodMult: 1.15 }));
put(39, sm({ splitSpreadMult: 1.5 }));
put(40, sm({ extraReflections: -2 }));
for (let i = 0; i < 20; i++) {
  put(41 + i, { kind: 'seriesAssortment', seriesId: `SER${String(i + 1).padStart(2, '0')}` });
  put(61 + i, { kind: 'seriesOutline', seriesId: `SER${String(i + 1).padStart(2, '0')}` });
}
put(81, sm({ bulletType: 'standard' }));
put(82, { kind: 'resetShotModifiers' });
put(83, sm({ radiusMult: 1.2 }));
put(84, sm({ radiusMult: 0.85 }));
put(85, sm({ launch: { count: 2, spreadRad: 0.1 } }));
put(86, sm({ launch: { count: 3, spreadRad: 0.175 } }));
put(87, sm({ damageMult: 1.5, pushMult: 0.75 }));
put(88, sm({ damageMult: 0.75, pushMult: 1.5 }));
put(89, sm({ speedMult: 1.2, pushMult: 0.75 }));
put(90, { kind: 'transformCopyType' });
put(91, { kind: 'transformRevert' });
put(92, { kind: 'transformToLastCollected' });
['hpRatio', 'oneMissing', 'notCollectedThisRun', 'duplicates', 'motionPeriod', 'aimPreview', 'trajectory', 'angleTicks'].forEach((h, i) =>
  put(93 + i, { kind: 'hint', hint: h }),
);

const effects = rows(emd, /^FX\d{3}$/)
  .filter((c) => c.length >= 7)
  .map((c) => {
    const n = Number(c[0].slice(2));
    const op = OPS[n] ?? fail(`no operation for ${c[0]}`);
    const timing = c[4] === '飛行終了後' ? 'afterFlight' : c[4] === '次射' ? 'nextShot' : fail(`timing of ${c[0]}: ${c[4]}`);
    const expected = ['shotModifiers', 'resetShotModifiers', 'hint'].includes(op.kind) ? 'nextShot' : 'afterFlight';
    if (timing !== expected) fail(`timing mismatch ${c[0]}: table says ${timing}, operation ${op.kind} expects ${expected}`);
    return { id: c[0], name_ja: c[1], operation: op, timing };
  });
if (effects.length !== 100) fail(`expected 100 effects, got ${effects.length}`);

// ---- profile (effects-100.md section 3.2; proposals, prototype) --------------
const profile = {
  rulesVersion: 'rules-v2-proposed-r001',
  valueStatus: 'prototype',
  slotCount: 36,
  cellCount: 36,
  pairSetBonusScore: 50,
  tierTargets: { easy: 12, normal: 16, hard: 8 },
  limits: {
    damagePushMult: { min: 0.5, max: 1.5 },
    maxPowerMultiplier: 4,
    speedMult: { min: 0.8, max: 1.2 },
    gravityMult: { min: 0.5, max: 1.5 },
    restitutionMult: { min: 0.65, max: 1 },
    swayMult: { min: 0.5, max: 1.5 },
    maxSwayAmplitudeRad: 0.05,
    loadPeriodMult: { min: 0.85, max: 1.15 },
    radiusMult: { min: 0.85, max: 1.2 },
    reflections: { min: 4, max: 10 },
    // The appendix gives only the base angle (0.35 rad) and the two proposals x0.75 and x1.5.
    splitSpreadMult: { min: 0.75, max: 1.5 },
  },
};

const files = {
  'pair-sets.json': pairs,
  'questions.json': questions,
  'groups.json': groups,
  'effects.json': effects,
  'series.json': series,
  'profile.json': profile,
};
const check = process.argv.includes('--check');
mkdirSync(outDir, { recursive: true });
let bad = 0;
for (const [name, data] of Object.entries(files)) {
  const text = JSON.stringify(data, null, 2) + '\n';
  const path = join(outDir, name);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      console.error(`out of date: ${name}`);
      bad++;
    }
  } else writeFileSync(path, text);
}
if (check && bad) process.exit(1);
console.log(`pairs ${pairs.length}, questions ${questions.length}, groups ${groups.length}, effects ${effects.length}, series ${series.length}`);
