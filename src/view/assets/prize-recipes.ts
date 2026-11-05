/**
 * Procedural model recipes for all 100 prize kinds (P001-P100), Task 11/13.
 * Source: generated in code by Claude (Sonnet 5.5); no external assets.
 * Names follow docs/prize-candidates.md. A recipe only decides LOOKS; the
 * physics shape is the truth and prizes.ts scales the result to fit inside it.
 *
 * Silhouette rules (small portrait screen): one dominant colour per prize,
 * one contrasting accent, a readable outline from the front (+z).
 */
import { Kit, ROT_X, ROT_Z, type V3 } from './kit';

export const C = {
  red: 0xd9382c, darkRed: 0x9a2320, white: 0xf8f4ea, cream: 0xf3e4bd, black: 0x2b2624, brown: 0x7a4a2b, lightBrown: 0xb98452,
  tan: 0xdcbb8c, yellow: 0xf5c62f, orange: 0xf08a26, pink: 0xf4a0b8, hotPink: 0xe2548a, blue: 0x3b7ed9, sky: 0x8fcdf0,
  navy: 0x27406c, green: 0x4ba34b, lime: 0x9bcf4e, darkGreen: 0x2f6c3b, purple: 0x8b5cc8, gray: 0x9b9b9b, lightGray: 0xd2d2d2,
  silver: 0xc5cad1, gold: 0xe2b232, teal: 0x34b0a4, glass: 0xa8e6e0,
} as const;

export interface PrizeRecipe {
  readonly name: string;
  readonly build: (k: Kit) => void;
}

const PI = Math.PI;

// ----------------------------------------------------------------- helpers

interface PlushOpts {
  body: number;
  belly?: number;
  ear?: 'round' | 'tall' | 'point' | 'floppy' | 'none';
  earColor?: number;
  earIn?: number;
  snout?: number;
  nose?: number;
  tail?: 'ball' | 'long' | 'big' | 'none';
  tailColor?: number;
  extra?: (k: Kit) => void;
}

/** Sitting plush animal facing +z: body, head, ears, snout, eyes. ~1.6 tall. */
function plush(k: Kit, o: PlushOpts): void {
  k.sph(o.body, 0.55, [0, 0.55, 0], [1, 1.05, 0.85]);
  if (o.belly !== undefined) k.sph(o.belly, 0.36, [0, 0.5, 0.3], [1, 1.1, 0.5]);
  k.sph(o.body, 0.4, [-0.42, 0.12, 0.32], [1, 0.8, 1.1]); // feet
  k.sph(o.body, 0.4, [0.42, 0.12, 0.32], [1, 0.8, 1.1]);
  k.sph(o.body, 0.2, [-0.58, 0.62, 0.15], [0.7, 1.2, 0.8]); // arms
  k.sph(o.body, 0.2, [0.58, 0.62, 0.15], [0.7, 1.2, 0.8]);
  k.sph(o.body, 0.44, [0, 1.3, 0.05]); // head
  const ec = o.earColor ?? o.body;
  const ei = o.earIn ?? ec;
  for (const s of [-1, 1]) {
    switch (o.ear ?? 'round') {
      case 'round':
        k.sph(ec, 0.17, [s * 0.34, 1.68, 0], [1, 1, 0.6]);
        k.sph(ei, 0.09, [s * 0.34, 1.68, 0.06], [1, 1, 0.5]);
        break;
      case 'tall':
        k.sph(ec, 0.15, [s * 0.18, 1.95, 0], [0.7, 2.4, 0.5]);
        k.sph(ei, 0.08, [s * 0.18, 1.95, 0.05], [0.6, 2.2, 0.4]);
        break;
      case 'point':
        k.cone(ec, 0.17, 0.34, [s * 0.28, 1.74, 0], [0, 0, -s * 0.25], 4);
        k.cone(ei, 0.09, 0.2, [s * 0.28, 1.72, 0.07], [0, 0, -s * 0.25], 4);
        break;
      case 'floppy':
        k.sph(ec, 0.15, [s * 0.44, 1.32, 0.02], [0.6, 1.6, 0.8]);
        break;
      case 'none':
        break;
    }
  }
  if (o.snout !== undefined) k.sph(o.snout, 0.2, [0, 1.2, 0.4], [1.15, 0.8, 0.9]);
  k.sph(o.nose ?? C.black, 0.06, [0, 1.26, 0.55], [1.2, 0.8, 0.8]);
  k.sph(C.black, 0.05, [-0.16, 1.4, 0.4]); // eyes
  k.sph(C.black, 0.05, [0.16, 1.4, 0.4]);
  switch (o.tail ?? 'none') {
    case 'ball':
      k.sph(o.tailColor ?? o.body, 0.14, [0, 0.2, -0.55]);
      break;
    case 'long':
      k.cyl(o.tailColor ?? o.body, 0.07, 0.08, 0.8, [0.5, 0.35, -0.5], [0.5, 0, -0.9]);
      break;
    case 'big':
      k.sph(o.tailColor ?? o.body, 0.26, [0.5, 0.45, -0.5], [0.8, 1.4, 0.8], [0, 0, -0.5]);
      break;
    case 'none':
      break;
  }
  o.extra?.(k);
}

/** Snack bag: crimped top and bottom, front label. */
function bag(k: Kit, body: number, label: number, w = 1.1, h = 1.4, d = 0.45): void {
  k.box(body, w, h, d, [0, h / 2, 0]);
  k.box(C.lightGray, w, 0.12, d * 0.6, [0, h + 0.04, 0]);
  k.box(C.lightGray, w, 0.1, d * 0.6, [0, -0.01, 0]);
  k.cyl(label, w * 0.28, w * 0.28, 0.04, [0, h * 0.55, d / 2 + 0.01], ROT_X);
}

function wheels(k: Kit, xs: readonly number[], y: number, z: number, r: number, color: number = C.black): void {
  for (const x of xs) {
    for (const s of [-1, 1]) {
      k.cyl(color, r, r, 0.14, [x, y, s * z], ROT_X, 8);
      k.cyl(C.silver, r * 0.45, r * 0.45, 0.16, [x, y, s * z], ROT_X, 6);
    }
  }
}

function pot(k: Kit, color: number = C.orange): void {
  k.cyl(color, 0.32, 0.24, 0.3, [0, 0.15, 0], undefined, 8);
}

function stand(k: Kit, w = 0.5, color: number = C.lightBrown): void {
  k.box(color, w, 0.08, w * 0.6, [0, 0.04, 0]);
}

function petals(k: Kit, color: number, n: number, rad: number, size: number, y: number, z: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    k.tri(color, size, size * 1.4, 0.08, [Math.sin(a) * rad, y + Math.cos(a) * rad, z], [0, 0, -a]);
  }
}

// ----------------------------------------------------------------- recipes

export const PRIZE_RECIPES: Readonly<Record<string, PrizeRecipe>> = {
  P001: {
    name: '菓子の詰め合わせ箱',
    build: (k) => {
      k.box(C.red, 1.4, 0.5, 1, [0, 0.25, 0]);
      k.box(C.darkRed, 1.48, 0.12, 1.08, [0, 0.56, 0]);
      k.box(C.white, 0.2, 0.7, 1.1, [0, 0.35, 0]);
      k.box(C.white, 1.5, 0.14, 0.2, [0, 0.58, 0]);
      k.sph(C.hotPink, 0.14, [-0.13, 0.74, 0], [1.2, 0.9, 0.9]);
      k.sph(C.hotPink, 0.14, [0.13, 0.74, 0], [1.2, 0.9, 0.9]);
      k.sph(C.yellow, 0.12, [0.45, 0.68, 0.2]);
      k.sph(C.green, 0.12, [-0.45, 0.68, -0.15]);
    },
  },
  P002: {
    name: '板チョコ',
    build: (k) => {
      k.box(C.brown, 0.8, 1.2, 0.16, [0, 0.6, 0]);
      for (const x of [-0.2, 0, 0.2]) k.box(0x5a3419, 0.035, 1.2, 0.02, [x, 0.6, 0.085]);
      for (const y of [0.3, 0.6, 0.9]) k.box(0x5a3419, 0.8, 0.035, 0.02, [0, y, 0.085]);
      k.box(C.red, 0.84, 0.42, 0.2, [0, 0.21, 0]);
      k.box(C.gold, 0.84, 0.06, 0.205, [0, 0.45, 0]);
      k.cyl(C.white, 0.12, 0.12, 0.02, [0, 0.21, 0.105], ROT_X, 8);
    },
  },
  P003: {
    name: 'クッキー缶',
    build: (k) => {
      k.cyl(C.blue, 0.6, 0.6, 0.5, [0, 0.25, 0]);
      k.cyl(C.navy, 0.64, 0.64, 0.12, [0, 0.56, 0]);
      k.tor(C.white, 0.6, 0.03, [0, 0.3, 0], [PI / 2, 0, 0]);
      k.sph(C.tan, 0.2, [-0.15, 0.66, 0.05], [1, 0.3, 1]);
      k.sph(C.lightBrown, 0.18, [0.2, 0.66, -0.1], [1, 0.3, 1]);
      k.sph(C.brown, 0.04, [-0.12, 0.7, 0.08]);
      k.sph(C.brown, 0.04, [0.22, 0.7, -0.08]);
    },
  },
  P004: {
    name: 'キャンディー袋',
    build: (k) => {
      bag(k, C.pink, C.white, 1.0, 1.3, 0.5);
      k.sph(C.red, 0.13, [-0.25, 0.4, 0.28]);
      k.sph(C.yellow, 0.13, [0.1, 0.7, 0.28]);
      k.sph(C.blue, 0.13, [0.3, 0.35, 0.28]);
      k.sph(C.green, 0.13, [-0.2, 0.95, 0.28]);
    },
  },
  P005: {
    name: 'グミ袋',
    build: (k) => {
      bag(k, C.green, C.yellow, 1.0, 1.3, 0.45);
      k.sph(C.red, 0.2, [0, 0.65, 0.26], [1, 1.2, 0.4]);
      k.sph(C.red, 0.11, [0, 0.9, 0.26], [1, 1, 0.4]);
      k.sph(C.red, 0.06, [-0.14, 0.98, 0.26], [1, 1, 0.4]);
      k.sph(C.red, 0.06, [0.14, 0.98, 0.26], [1, 1, 0.4]);
    },
  },
  P006: {
    name: '小さな買い物かご',
    build: (k) => {
      k.box(C.lightBrown, 1.3, 0.06, 0.8, [0, 0.03, 0]);
      k.box(C.tan, 1.3, 0.5, 0.06, [0, 0.28, 0.4]);
      k.box(C.tan, 1.3, 0.5, 0.06, [0, 0.28, -0.4]);
      k.box(C.tan, 0.06, 0.5, 0.8, [-0.65, 0.28, 0]);
      k.box(C.tan, 0.06, 0.5, 0.8, [0.65, 0.28, 0]);
      k.box(C.brown, 1.34, 0.06, 0.84, [0, 0.55, 0]);
      k.tor(C.brown, 0.62, 0.04, [0, 0.55, 0], undefined, PI);
      k.sph(C.red, 0.2, [-0.3, 0.55, 0]);
      k.sph(C.green, 0.16, [0.1, 0.5, 0.1]);
      k.sph(C.yellow, 0.16, [0.4, 0.5, -0.1], [1, 0.8, 1]);
    },
  },
  P007: {
    name: 'ポテトチップス袋',
    build: (k) => {
      bag(k, C.red, C.yellow, 1.3, 1.4, 0.4);
      k.box(C.yellow, 1.3, 0.2, 0.42, [0, 0.35, 0]);
      k.sph(C.cream, 0.18, [0, 0.9, 0.22], [1.3, 1, 0.3]);
    },
  },
  P008: {
    name: 'ポップコーン箱',
    build: (k) => {
      k.cyl(C.white, 0.75, 0.55, 1.0, [0, 0.5, 0], [0, PI / 4, 0], 4);
      for (const x of [-0.45, 0, 0.45]) k.box(C.red, 0.2, 0.98, 0.05, [x, 0.5, 0.62 - Math.abs(x) * 0.0], [-0.1, 0, 0]);
      for (const [x, y, z] of [[-0.3, 1.1, 0.1], [0.1, 1.15, -0.1], [0.35, 1.05, 0.2], [-0.05, 1.28, 0.1], [0.3, 1.25, -0.2], [-0.4, 1.2, -0.2]] as V3[]) {
        k.sph(C.cream, 0.2, [x, y, z]);
        k.sph(C.yellow, 0.08, [x + 0.06, y + 0.1, z + 0.12]);
      }
    },
  },
  P009: {
    name: 'バラの飾り',
    build: (k) => {
      pot(k, C.white);
      k.cyl(C.darkGreen, 0.04, 0.05, 1.0, [0, 0.8, 0], undefined, 5);
      k.sph(C.darkRed, 0.3, [0, 1.4, 0], [1, 0.9, 1]);
      k.sph(C.red, 0.24, [0, 1.46, 0.04]);
      k.sph(C.hotPink, 0.14, [0, 1.52, 0.06]);
      k.sph(C.darkGreen, 0.2, [-0.36, 0.9, 0], [1.6, 0.3, 0.8], [0, 0, 0.5]);
      k.sph(C.darkGreen, 0.2, [0.36, 0.8, 0], [1.6, 0.3, 0.8], [0, 0, -0.5]);
    },
  },
  P010: {
    name: 'ティーカップのミニチュア',
    build: (k) => {
      k.cyl(C.white, 0.7, 0.58, 0.06, [0, 0.03, 0]);
      k.cyl(C.white, 0.48, 0.32, 0.6, [0, 0.36, 0]);
      k.cyl(0x8b5a2b, 0.43, 0.43, 0.02, [0, 0.65, 0]);
      k.tor(C.sky, 0.45, 0.03, [0, 0.58, 0], ROT_X);
      k.tor(C.white, 0.17, 0.05, [0.52, 0.4, 0], undefined, PI * 1.5);
    },
  },
  P011: {
    name: 'ティーポットのミニチュア',
    build: (k) => {
      k.sph(C.white, 0.55, [0, 0.5, 0], [1, 0.85, 1]);
      k.tor(C.pink, 0.52, 0.04, [0, 0.55, 0], ROT_X);
      k.cyl(C.white, 0.22, 0.3, 0.12, [0, 0.95, 0]);
      k.sph(C.pink, 0.1, [0, 1.08, 0]);
      k.cone(C.white, 0.14, 0.6, [0.72, 0.62, 0], [0, 0, -1.0], 6);
      k.tor(C.white, 0.25, 0.05, [-0.62, 0.55, 0], undefined, PI * 1.6);
    },
  },
  P012: {
    name: 'ケーキの食品模型',
    build: (k) => {
      k.cyl(C.white, 0.9, 0.8, 0.06, [0, 0.03, 0]);
      k.cyl(C.cream, 0.6, 0.6, 0.3, [0, 0.21, 0]);
      k.cyl(C.white, 0.62, 0.62, 0.08, [0, 0.4, 0]);
      k.cyl(C.cream, 0.6, 0.6, 0.28, [0, 0.58, 0]);
      k.cyl(C.pink, 0.62, 0.62, 0.1, [0, 0.77, 0]);
      for (const a of [0, 2.1, 4.2]) {
        k.sph(C.red, 0.13, [Math.sin(a) * 0.3, 0.9, Math.cos(a) * 0.3], [1, 1.1, 1]);
        k.sph(C.darkGreen, 0.04, [Math.sin(a) * 0.3, 1.02, Math.cos(a) * 0.3]);
      }
    },
  },
  P013: {
    name: 'ミニうちわ',
    build: (k) => {
      k.cyl(C.white, 0.6, 0.6, 0.05, [0, 1.0, 0], ROT_X);
      k.cyl(C.red, 0.42, 0.42, 0.07, [0, 1.0, 0], ROT_X);
      k.cyl(C.white, 0.2, 0.2, 0.08, [0, 1.0, 0], ROT_X);
      k.tor(C.lightBrown, 0.6, 0.04, [0, 1.0, 0]);
      k.box(C.lightBrown, 0.16, 0.7, 0.06, [0, 0.25, 0]);
    },
  },
  P014: {
    name: 'ミニ提灯',
    build: (k) => {
      k.cyl(C.black, 0.28, 0.28, 0.08, [0, 1.05, 0]);
      k.sph(C.red, 0.55, [0, 0.55, 0], [1, 0.95, 1]);
      for (const y of [0.3, 0.55, 0.8]) k.tor(C.darkRed, y === 0.55 ? 0.55 : 0.5, 0.025, [0, y, 0], [PI / 2, 0, 0]);
      k.cyl(C.black, 0.28, 0.28, 0.08, [0, 0.02, 0]);
      k.cyl(C.white, 0.2, 0.2, 0.04, [0, 0.55, 0.52], ROT_X);
      k.tor(C.black, 0.12, 0.02, [0, 1.17, 0]);
      k.cone(C.gold, 0.06, 0.25, [0, -0.1, 0], [PI, 0, 0], 5);
    },
  },
  P015: {
    name: 'キツネのお面',
    build: (k) => {
      k.sph(C.white, 0.6, [0, 0.8, 0], [1, 1.1, 0.35]);
      k.cone(C.white, 0.3, 0.55, [0, 0.58, 0.3], [PI / 2 + 0.2, 0, 0], 8);
      k.sph(C.black, 0.07, [0, 0.52, 0.58]);
      for (const s of [-1, 1]) {
        k.tri(C.orange, 0.36, 0.5, 0.1, [s * 0.36, 1.6, 0], [0, 0, -s * 0.2]);
        k.tri(C.black, 0.18, 0.25, 0.12, [s * 0.36, 1.68, 0.02], [0, 0, -s * 0.2]);
        k.box(C.red, 0.3, 0.05, 0.05, [s * 0.3, 0.98, 0.22], [0, 0, s * 0.4]);
        k.box(C.red, 0.2, 0.04, 0.05, [s * 0.38, 0.6, 0.2], [0, 0, -s * 0.3]);
      }
      k.box(C.red, 0.5, 0.06, 0.05, [0, 1.2, 0.2]);
      stand(k, 0.6);
    },
  },
  P016: {
    name: 'ラムネ瓶の模型',
    build: (k) => {
      k.cyl(C.glass, 0.34, 0.34, 1.0, [0, 0.5, 0]);
      k.cyl(C.glass, 0.17, 0.32, 0.3, [0, 1.15, 0]);
      k.cyl(C.glass, 0.16, 0.16, 0.25, [0, 1.38, 0]);
      k.cyl(C.sky, 0.2, 0.2, 0.08, [0, 1.52, 0]);
      k.sph(C.white, 0.09, [0, 1.2, 0]);
      k.cyl(C.blue, 0.35, 0.35, 0.3, [0, 0.5, 0]);
      k.cyl(C.white, 0.36, 0.36, 0.1, [0, 0.5, 0]);
    },
  },
  P017: {
    name: 'りんご飴の食品模型',
    build: (k) => {
      k.cone(C.white, 0.4, 0.4, [0, 0.2, 0], [PI, 0, 0], 8);
      k.cyl(C.lightBrown, 0.04, 0.04, 1.2, [0, 0.8, 0], undefined, 5);
      k.sph(C.red, 0.5, [0, 1.15, 0]);
      k.sph(C.white, 0.1, [-0.2, 1.35, 0.35], [1, 1.4, 0.4], [0, 0, 0.5]);
      k.cone(C.darkRed, 0.1, 0.1, [0, 0.62, 0], [PI, 0, 0], 6);
    },
  },
  P018: {
    name: '綿あめの食品模型',
    build: (k) => {
      k.box(C.lightBrown, 0.5, 0.08, 0.4, [0, 0.04, 0]);
      k.cyl(C.white, 0.04, 0.04, 0.7, [0, 0.4, 0], undefined, 5);
      for (const [x, y, z, r] of [[0, 1.1, 0, 0.5], [-0.3, 0.95, 0.15, 0.35], [0.3, 0.95, 0.15, 0.35], [0, 1.45, 0.05, 0.3], [-0.2, 1.25, -0.2, 0.3], [0.25, 1.3, -0.1, 0.32]] as [number, number, number, number][]) {
        k.sph(y > 1.2 ? C.hotPink : C.pink, r, [x, y, z]);
      }
    },
  },
  P019: {
    name: '風鈴',
    build: (k) => {
      k.tor(C.gold, 0.07, 0.02, [0, 1.55, 0]);
      k.cyl(C.red, 0.03, 0.03, 0.15, [0, 1.45, 0], undefined, 4);
      k.sph(C.glass, 0.5, [0, 1.0, 0], [1, 0.9, 1]);
      k.tor(C.blue, 0.4, 0.04, [0, 0.95, 0], ROT_X);
      k.tor(C.blue, 0.2, 0.03, [0, 1.3, 0], ROT_X);
      k.cyl(C.gold, 0.02, 0.02, 0.35, [0, 0.7, 0], undefined, 4);
      k.sph(C.gold, 0.06, [0, 0.5, 0]);
      k.box(C.hotPink, 0.18, 0.55, 0.02, [0, 0.2, 0]);
    },
  },
  P020: {
    name: '月のクッション',
    build: (k) => {
      k.tor(C.yellow, 0.6, 0.28, [0, 0.9, 0], [0, 0, -0.7], PI * 1.35, [1, 1, 0.6]);
      k.sph(C.black, 0.04, [0.45, 1.35, 0.2]);
      k.sph(C.hotPink, 0.07, [0.52, 1.15, 0.2], [1, 0.6, 0.5]);
      k.box(C.cream, 0.5, 0.06, 0.5, [0, 0.03, 0]);
    },
  },
  P021: {
    name: '星の飾り',
    build: (k) => {
      k.star(C.yellow, 0.75, 0.34, 0.25, [0, 0.95, 0]);
      k.star(C.gold, 0.5, 0.22, 0.28, [0, 0.95, 0]);
      k.cyl(C.lightBrown, 0.05, 0.05, 0.35, [0, 0.18, 0], undefined, 5);
      stand(k, 0.5);
    },
  },
  P022: {
    name: 'ヨーヨー風船',
    build: (k) => {
      k.sph(C.blue, 0.55, [0, 0.9, 0]);
      for (const a of [0.4, 1.2]) k.tor(C.white, 0.5, 0.04, [0, 0.9, 0], [0, a, 0]);
      k.tor(C.red, 0.55, 0.03, [0, 0.9, 0], ROT_X);
      k.cone(C.blue, 0.14, 0.2, [0, 0.38, 0], [PI, 0, 0], 6);
      k.cyl(C.white, 0.02, 0.02, 0.5, [0.1, 0.05, 0], [0, 0, 0.3], 4);
      k.tor(C.white, 0.1, 0.02, [0.2, -0.2, 0]);
    },
  },
  P023: {
    name: '金魚のおもちゃ',
    build: (k) => {
      k.sph(C.orange, 0.5, [0, 0.55, 0], [1.3, 0.9, 0.7]);
      k.tri(C.red, 0.7, 0.8, 0.08, [-0.78, 0.6, 0], [0, 0, PI / 2 + 0.2]);
      k.tri(C.red, 0.5, 0.6, 0.08, [-0.72, 0.4, 0], [0, 0, PI / 2 - 0.5]);
      k.tri(C.red, 0.3, 0.4, 0.08, [0, 1.0, 0], [0, 0, 0.1]);
      k.sph(C.white, 0.11, [0.45, 0.65, 0.3]);
      k.sph(C.black, 0.06, [0.5, 0.65, 0.38]);
      k.sph(C.red, 0.08, [0.62, 0.4, 0.2], [1, 0.6, 1]);
      stand(k, 0.7);
    },
  },
  P024: {
    name: 'こま',
    build: (k) => {
      k.cone(C.red, 0.6, 0.7, [0, 0.45, 0], [PI, 0, 0], 10);
      k.cyl(C.yellow, 0.62, 0.62, 0.14, [0, 0.82, 0]);
      k.cyl(C.blue, 0.5, 0.5, 0.1, [0, 0.93, 0]);
      k.cyl(C.lightBrown, 0.06, 0.06, 0.4, [0, 1.15, 0], undefined, 6);
      k.cone(C.silver, 0.05, 0.15, [0, 0.05, 0], [PI, 0, 0], 6);
    },
  },
  P025: {
    name: 'けん玉',
    build: (k) => {
      k.cyl(C.lightBrown, 0.12, 0.16, 1.2, [0, 0.8, 0]);
      k.cone(C.lightBrown, 0.12, 0.2, [0, 1.5, 0], undefined, 6);
      k.cyl(C.red, 0.18, 0.18, 0.18, [-0.4, 0.95, 0], ROT_Z);
      k.cyl(C.red, 0.18, 0.18, 0.18, [0.4, 0.95, 0], ROT_Z);
      k.cyl(C.lightBrown, 0.09, 0.09, 0.8, [0, 0.95, 0], ROT_Z);
      k.sph(C.red, 0.34, [0.35, 0.3, 0.1]);
      k.tor(C.white, 0.34, 0.03, [0.35, 0.3, 0.1], ROT_X);
      k.cyl(C.white, 0.015, 0.015, 0.7, [0.18, 0.62, 0.05], [0, 0, -0.5], 3);
    },
  },
  P026: {
    name: '紙風船',
    build: (k) => {
      k.sph(C.red, 0.6, [0, 0.7, 0]);
      for (const a of [0, 0.8, 1.6, 2.4]) k.tor(a === 0.8 || a === 2.4 ? C.yellow : C.blue, 0.58, 0.07, [0, 0.7, 0], [0, a, 0]);
      k.cyl(C.white, 0.1, 0.1, 0.1, [0, 1.3, 0], undefined, 6);
      k.cyl(C.white, 0.08, 0.08, 0.08, [0, 0.08, 0], undefined, 6);
    },
  },
  P027: {
    name: '凧のおもちゃ',
    build: (k) => {
      k.box(C.red, 0.9, 0.9, 0.05, [0, 1.0, 0], [0, 0, PI / 4]);
      k.box(C.white, 0.3, 0.9, 0.06, [0, 1.0, 0], [0, 0, PI / 4]);
      k.box(C.lightBrown, 1.3, 0.04, 0.04, [0, 1.0, 0.04]);
      k.box(C.lightBrown, 0.04, 1.3, 0.04, [0, 1.0, 0.04]);
      for (const [i, c] of [C.blue, C.yellow, C.green].entries()) {
        k.tri(c, 0.22, 0.18, 0.04, [0, 0.2 - i * 0.25 + 0.4, 0], [0, 0, i % 2 ? 0.4 : -0.4]);
      }
      k.cyl(C.white, 0.012, 0.012, 0.5, [0, 0.3, 0], undefined, 3);
    },
  },
  P028: {
    name: '太鼓のおもちゃ',
    build: (k) => {
      k.cyl(C.darkRed, 0.62, 0.62, 0.7, [0, 0.62, 0], ROT_X);
      k.sph(C.red, 0.7, [0, 0.62, 0], [1, 1, 0.6]);
      k.cyl(C.cream, 0.58, 0.58, 0.08, [0, 0.62, 0.45], ROT_X);
      k.tor(C.gold, 0.6, 0.03, [0, 0.62, 0.49]);
      k.box(C.lightBrown, 0.9, 0.3, 0.5, [0, 0.14, 0]);
      k.cyl(C.lightBrown, 0.03, 0.03, 0.9, [-0.1, 1.3, 0.4], [0, 0, 1.0], 5);
      k.cyl(C.lightBrown, 0.03, 0.03, 0.9, [0.1, 1.3, 0.4], [0, 0, -1.0], 5);
    },
  },
  P029: { name: '犬のぬいぐるみ', build: (k) => plush(k, { body: C.tan, belly: C.cream, ear: 'floppy', earColor: C.brown, snout: C.cream, tail: 'ball' }) },
  P030: {
    name: '猫のぬいぐるみ',
    build: (k) =>
      plush(k, {
        body: C.gray, belly: C.white, ear: 'point', earIn: C.pink, snout: C.white, nose: C.pink, tail: 'long',
        extra: (kk) => {
          for (const s of [-1, 1]) {
            kk.box(C.white, 0.3, 0.015, 0.015, [s * 0.38, 1.22, 0.42], [0, 0, s * 0.15]);
            kk.box(C.white, 0.3, 0.015, 0.015, [s * 0.38, 1.17, 0.42], [0, 0, -s * 0.15]);
          }
        },
      }),
  },
  P031: { name: 'ウサギのぬいぐるみ', build: (k) => plush(k, { body: C.white, belly: C.pink, ear: 'tall', earIn: C.pink, snout: C.white, nose: C.pink, tail: 'ball' }) },
  P032: {
    name: 'ゾウのぬいぐるみ',
    build: (k) =>
      plush(k, {
        body: C.lightGray, belly: C.white, ear: 'none', tail: 'ball',
        extra: (kk) => {
          for (const s of [-1, 1]) kk.cyl(C.lightGray, 0.38, 0.38, 0.08, [s * 0.5, 1.4, 0.0], [PI / 2, 0, 0.0], 8, 0, PI * 2, [1, 1, 1.0]);
          kk.cyl(C.gray, 0.11, 0.15, 0.55, [0, 1.0, 0.5], [-0.35, 0, 0], 6);
          kk.sph(C.gray, 0.13, [0, 0.72, 0.62]);
          for (const s of [-1, 1]) kk.cone(C.white, 0.05, 0.28, [s * 0.15, 1.05, 0.5], [0.9, 0, -s * 0.2], 5);
        },
      }),
  },
  P033: {
    name: 'シマウマのぬいぐるみ',
    build: (k) =>
      plush(k, {
        body: C.white, belly: C.white, ear: 'point', earIn: C.black, snout: C.gray, tail: 'long', tailColor: C.black,
        extra: (kk) => {
          for (const y of [0.3, 0.55, 0.8]) kk.box(C.black, 1.1, 0.07, 0.05, [0, y, 0.45]);
          for (const x of [-0.25, 0, 0.25]) kk.box(C.black, 0.05, 0.22, 0.04, [x, 1.62, 0.2]);
          kk.box(C.black, 0.08, 0.5, 0.4, [0, 1.5, -0.2]);
        },
      }),
  },
  P034: {
    name: 'ライオンのぬいぐるみ',
    build: (k) =>
      plush(k, {
        body: C.tan, belly: C.cream, ear: 'round', snout: C.cream, tail: 'long', tailColor: C.tan,
        extra: (kk) => {
          kk.sph(C.orange, 0.62, [0, 1.3, -0.1], [1, 1, 0.5]);
          kk.sph(C.brown, 0.3, [0, 1.0, 0.05], [1.3, 0.5, 0.7]);
          kk.sph(C.brown, 0.1, [0.7, 0.15, -0.45]);
        },
      }),
  },
  P035: { name: 'クマのぬいぐるみ', build: (k) => plush(k, { body: C.brown, belly: C.tan, ear: 'round', earIn: C.tan, snout: C.tan, tail: 'ball' }) },
  P036: {
    name: 'キツネのぬいぐるみ',
    build: (k) =>
      plush(k, {
        body: C.orange, belly: C.white, ear: 'point', earColor: C.orange, earIn: C.black, snout: C.white, tail: 'big', tailColor: C.orange,
        extra: (kk) => kk.sph(C.white, 0.14, [0.65, 0.95, -0.55], [0.8, 1.2, 0.8]),
      }),
  },
  P037: {
    name: 'ハリネズミのぬいぐるみ',
    build: (k) => {
      k.sph(C.brown, 0.65, [0, 0.6, -0.05], [1.1, 0.9, 1]);
      for (let i = 0; i < 9; i++) {
        const a = -1.3 + i * 0.33;
        k.cone(0x4d2f1a, 0.1, 0.4, [Math.sin(a) * 0.62, 0.65 + Math.cos(a) * 0.45, -0.25], [0, 0, -a], 4);
      }
      k.sph(C.tan, 0.38, [0.1, 0.45, 0.45], [1, 0.9, 1.2]);
      k.sph(C.black, 0.07, [0.1, 0.45, 0.88]);
      k.sph(C.black, 0.05, [-0.1, 0.62, 0.65]);
      k.sph(C.black, 0.05, [0.3, 0.62, 0.65]);
      k.sph(C.tan, 0.1, [-0.2, 0.75, 0.4]);
    },
  },
  P038: {
    name: 'パンダのぬいぐるみ',
    build: (k) =>
      plush(k, {
        body: C.white, belly: C.white, ear: 'round', earColor: C.black, earIn: C.black, snout: C.white, tail: 'ball',
        extra: (kk) => {
          for (const s of [-1, 1]) {
            kk.sph(C.black, 0.12, [s * 0.16, 1.4, 0.37], [0.8, 1.3, 0.5], [0, 0, s * 0.4]);
            kk.sph(C.black, 0.24, [s * 0.58, 0.62, 0.15], [0.7, 1.2, 0.8]);
            kk.sph(C.black, 0.4, [s * 0.42, 0.12, 0.32], [1, 0.8, 1.1]);
          }
          kk.box(C.black, 1.2, 0.18, 0.4, [0, 0.8, 0.12]);
        },
      }),
  },
  P039: {
    name: 'ペンギンのぬいぐるみ',
    build: (k) => {
      k.sph(C.navy, 0.58, [0, 0.62, 0], [1, 1.25, 0.85]);
      k.sph(C.white, 0.42, [0, 0.55, 0.22], [1, 1.2, 0.6]);
      k.sph(C.navy, 0.2, [-0.6, 0.62, 0.05], [0.5, 1.5, 0.8], [0, 0, 0.3]);
      k.sph(C.navy, 0.2, [0.6, 0.62, 0.05], [0.5, 1.5, 0.8], [0, 0, -0.3]);
      k.cone(C.orange, 0.1, 0.22, [0, 1.3, 0.55], [PI / 2, 0, 0], 4);
      k.sph(C.white, 0.09, [-0.17, 1.37, 0.4]);
      k.sph(C.white, 0.09, [0.17, 1.37, 0.4]);
      k.sph(C.black, 0.05, [-0.17, 1.37, 0.48]);
      k.sph(C.black, 0.05, [0.17, 1.37, 0.48]);
      k.sph(C.orange, 0.2, [-0.25, 0.05, 0.3], [1.2, 0.4, 1.4]);
      k.sph(C.orange, 0.2, [0.25, 0.05, 0.3], [1.2, 0.4, 1.4]);
    },
  },
  P040: {
    name: '雲のクッション',
    build: (k) => {
      for (const [x, y, r] of [[-0.55, 0.4, 0.4], [0, 0.6, 0.55], [0.55, 0.4, 0.4], [0.2, 0.25, 0.4], [-0.25, 0.25, 0.4]] as [number, number, number][]) {
        k.sph(C.white, r, [x, y, 0], [1, 0.9, 0.55]);
      }
      k.sph(C.sky, 0.3, [0, 0.55, 0.12], [1.5, 0.7, 0.3]);
      k.sph(C.black, 0.04, [-0.12, 0.68, 0.3]);
      k.sph(C.black, 0.04, [0.12, 0.68, 0.3]);
      k.sph(C.pink, 0.06, [-0.25, 0.58, 0.3], [1, 0.6, 0.4]);
      k.sph(C.pink, 0.06, [0.25, 0.58, 0.3], [1, 0.6, 0.4]);
    },
  },
  P041: {
    name: '三色団子の食品模型',
    build: (k) => {
      stand(k, 0.7, C.lightBrown);
      k.cyl(C.lightBrown, 0.035, 0.035, 1.5, [0, 0.8, 0], undefined, 5);
      k.sph(C.hotPink, 0.3, [0, 1.35, 0]);
      k.sph(C.white, 0.3, [0, 0.95, 0]);
      k.sph(C.lime, 0.3, [0, 0.55, 0]);
    },
  },
  P042: {
    name: '木のミニチュア',
    build: (k) => {
      k.cyl(C.green, 0.5, 0.55, 0.1, [0, 0.05, 0], undefined, 8);
      k.cyl(C.brown, 0.12, 0.17, 0.7, [0, 0.45, 0], undefined, 6);
      k.sph(C.darkGreen, 0.55, [0, 1.0, 0]);
      k.sph(C.green, 0.45, [-0.3, 1.3, 0.1]);
      k.sph(C.green, 0.45, [0.3, 1.3, -0.1]);
      k.sph(C.lime, 0.38, [0, 1.6, 0]);
      k.sph(C.red, 0.07, [0.2, 1.05, 0.5]);
    },
  },
  P043: {
    name: 'キノコの飾り',
    build: (k) => {
      k.cyl(C.cream, 0.2, 0.28, 0.6, [0, 0.3, 0], undefined, 7);
      k.sph(C.red, 0.7, [0, 0.8, 0], [1, 0.75, 1]);
      k.cyl(C.darkRed, 0.62, 0.62, 0.05, [0, 0.65, 0]);
      for (const d of [[0, 1, 0.1], [0.7, 0.6, 0.6], [-0.7, 0.5, 0.6], [0.2, 0.4, 1], [-0.3, 0.7, 0.9]] as V3[]) k.dot(C.white, 0.7, d, 0.13, 0.4, [0, 0.8, 0]);
    },
  },
  P044: {
    name: 'カメラのおもちゃ',
    build: (k) => {
      k.box(C.black, 1.3, 0.7, 0.45, [0, 0.45, 0]);
      k.box(C.silver, 1.32, 0.25, 0.46, [0, 0.72, 0]);
      k.cyl(C.gray, 0.3, 0.3, 0.2, [0.05, 0.45, 0.3], ROT_X);
      k.cyl(C.black, 0.22, 0.22, 0.12, [0.05, 0.45, 0.42], ROT_X);
      k.cyl(C.sky, 0.14, 0.14, 0.04, [0.05, 0.45, 0.49], ROT_X);
      k.box(C.red, 0.12, 0.1, 0.1, [-0.5, 0.88, 0]);
      k.box(C.white, 0.24, 0.14, 0.05, [0.45, 0.72, 0.24]);
      k.box(C.gray, 0.2, 0.1, 0.2, [0.2, 0.87, 0]);
    },
  },
  P045: {
    name: 'イルカのおもちゃ',
    build: (k) => {
      k.sph(C.blue, 0.5, [0, 0.7, 0], [1.6, 0.8, 0.6]);
      k.sph(C.white, 0.4, [0.05, 0.55, 0.12], [1.5, 0.6, 0.6]);
      k.cone(C.blue, 0.13, 0.5, [0.85, 0.7, 0], [0, 0, -PI / 2], 6);
      k.tri(C.blue, 0.4, 0.5, 0.06, [-0.25, 1.15, 0], [0, 0, 0.2]);
      k.tri(C.blue, 0.7, 0.35, 0.06, [-1.0, 0.95, 0], [0, 0, PI / 2 + 0.3]);
      k.tri(C.blue, 0.4, 0.3, 0.06, [0.2, 0.3, 0.3], [0.5, 0, PI - 0.3]);
      k.sph(C.black, 0.05, [0.5, 0.82, 0.3]);
      k.sph(C.sky, 0.3, [0, 0.12, 0], [1.2, 0.3, 0.8]);
    },
  },
  P046: {
    name: 'カクレクマノミのおもちゃ',
    build: (k) => {
      k.sph(C.orange, 0.5, [0, 0.6, 0], [1.2, 0.95, 0.65]);
      for (const x of [-0.25, 0.3]) k.sph(C.white, 0.44, [x, 0.6, 0], [0.22, 1.0, 0.7]);
      k.tri(C.orange, 0.55, 0.6, 0.06, [-0.78, 0.6, 0], [0, 0, PI / 2]);
      k.tri(C.orange, 0.4, 0.4, 0.06, [0, 1.15, 0], [0, 0, 0.1]);
      k.sph(C.white, 0.1, [0.5, 0.7, 0.28]);
      k.sph(C.black, 0.05, [0.55, 0.7, 0.35]);
      k.sph(C.orange, 0.12, [0.1, 0.3, 0.25], [1, 0.5, 0.5]);
      stand(k, 0.7);
    },
  },
  P047: {
    name: 'クジラのぬいぐるみ',
    build: (k) => {
      k.sph(C.blue, 0.75, [0, 0.7, 0], [1.4, 0.95, 0.9]);
      k.sph(C.white, 0.6, [0.15, 0.5, 0.2], [1.4, 0.7, 0.8]);
      k.tri(C.blue, 0.45, 0.6, 0.2, [-1.15, 1.15, 0], [0, 0, PI / 2 + 0.8]);
      k.tri(C.blue, 0.45, 0.6, 0.2, [-1.15, 0.95, 0], [0, 0, PI / 2 - 0.2]);
      k.sph(C.black, 0.06, [0.7, 0.95, 0.6]);
      k.sph(C.hotPink, 0.08, [0.85, 0.6, 0.65], [1, 0.6, 0.4]);
      k.cyl(C.sky, 0.03, 0.03, 0.4, [0.3, 1.6, 0], undefined, 4);
      k.sph(C.sky, 0.12, [0.3, 1.85, 0], [1.5, 0.7, 0.7]);
    },
  },
  P048: {
    name: 'ウミガメの模型',
    build: (k) => {
      k.sph(C.darkGreen, 0.8, [0, 0.45, 0], [1.1, 0.55, 1]);
      k.sph(C.green, 0.3, [0, 0.8, 0], [1.3, 0.4, 1.3]);
      for (const [x, z] of [[-0.45, 0.3], [0.45, 0.3], [-0.45, -0.3], [0.45, -0.3]] as [number, number][]) k.sph(C.lime, 0.2, [x, 0.7, z], [1.1, 0.4, 1.1]);
      k.sph(C.lime, 0.28, [0, 0.4, 0.95]);
      k.sph(C.black, 0.04, [-0.12, 0.5, 1.15]);
      k.sph(C.black, 0.04, [0.12, 0.5, 1.15]);
      for (const sx of [-1, 1]) {
        k.sph(C.lime, 0.28, [sx * 0.95, 0.25, 0.5], [1.4, 0.25, 0.7], [0, sx * 0.5, 0]);
        k.sph(C.lime, 0.2, [sx * 0.8, 0.2, -0.65], [1.2, 0.25, 0.7], [0, -sx * 0.5, 0]);
      }
    },
  },
  P049: {
    name: 'カニのおもちゃ',
    build: (k) => {
      k.sph(C.red, 0.6, [0, 0.4, 0], [1.3, 0.55, 0.9]);
      for (const s of [-1, 1]) {
        k.cyl(C.darkRed, 0.04, 0.05, 0.5, [s * 0.9, 0.9, 0.25], [0, 0, s * 0.3], 5);
        k.sph(C.red, 0.3, [s * 1.0, 1.25, 0.3], [1.2, 1.0, 0.7]);
        k.tri(C.darkRed, 0.2, 0.28, 0.1, [s * 1.0, 1.55, 0.3], [0, 0, s * 0.3]);
        k.cyl(C.white, 0.03, 0.03, 0.25, [s * 0.2, 0.9, 0.5], undefined, 4);
        k.sph(C.white, 0.09, [s * 0.2, 1.05, 0.5]);
        k.sph(C.black, 0.05, [s * 0.2, 1.06, 0.58]);
        for (const [i, z] of [0.15, -0.05, -0.25].entries()) k.cyl(C.darkRed, 0.03, 0.04, 0.5, [s * (0.75 + i * 0.03), 0.2, z], [0, 0, s * (1.0 + i * 0.1)], 4);
      }
    },
  },
  P050: {
    name: '貝殻の飾り',
    build: (k) => {
      k.cyl(C.pink, 0.85, 0.85, 0.22, [0, 0.18, 0], ROT_X, 14, PI / 2, PI);
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.4;
        k.box(C.hotPink, 0.05, 0.62, 0.25, [Math.sin(a) * 0.4, 0.18 + Math.cos(a) * 0.4, 0], [0, 0, -a]);
      }
      k.box(C.cream, 0.34, 0.16, 0.26, [0, 0.12, 0]);
      stand(k, 0.8, C.cream);
    },
  },
  P051: {
    name: 'ヒトデの飾り',
    build: (k) => {
      k.star(C.orange, 0.85, 0.38, 0.25, [0, 0.85, 0]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2;
        k.sph(C.yellow, 0.06, [Math.sin(a) * 0.5, 0.85 + Math.cos(a) * 0.5, 0.14]);
      }
      k.sph(C.red, 0.1, [0, 0.85, 0.14]);
      stand(k, 0.6, C.cream);
    },
  },
  P052: {
    name: 'タコのおもちゃ',
    build: (k) => {
      k.sph(C.hotPink, 0.6, [0, 1.1, 0], [1, 1.1, 0.9]);
      k.sph(C.white, 0.12, [-0.22, 1.05, 0.5]);
      k.sph(C.white, 0.12, [0.22, 1.05, 0.5]);
      k.sph(C.black, 0.06, [-0.22, 1.05, 0.6]);
      k.sph(C.black, 0.06, [0.22, 1.05, 0.6]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        k.cyl(C.red, 0.07, 0.12, 0.7, [Math.sin(a) * 0.5, 0.35, Math.cos(a) * 0.4], [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4], 5);
        k.sph(C.red, 0.1, [Math.sin(a) * 0.62, 0.02, Math.cos(a) * 0.5]);
      }
    },
  },
  P053: {
    name: 'クラゲの飾り',
    build: (k) => {
      k.sph(C.glass, 0.7, [0, 1.0, 0], [1, 0.75, 1]);
      k.sph(C.pink, 0.4, [0, 1.05, 0], [1, 0.6, 1]);
      k.tor(C.sky, 0.65, 0.05, [0, 0.68, 0], ROT_X);
      for (let i = 0; i < 6; i++) {
        const x = -0.45 + i * 0.18;
        k.cyl(C.sky, 0.03, 0.03, 0.6 + (i % 2) * 0.2, [x, 0.3, ((i % 3) - 1) * 0.15], undefined, 4);
      }
      k.sph(C.black, 0.05, [-0.2, 1.1, 0.62]);
      k.sph(C.black, 0.05, [0.2, 1.1, 0.62]);
    },
  },
  P054: {
    name: '船の模型',
    build: (k) => {
      k.box(C.darkRed, 1.7, 0.4, 0.6, [0, 0.25, 0]);
      k.tri(C.darkRed, 0.6, 0.4, 0.6, [1.0, 0.25, 0], [0, 0, -PI / 2]);
      k.box(C.white, 1.72, 0.08, 0.62, [0, 0.38, 0]);
      k.box(C.brown, 0.12, 0.08, 0.6, [-0.9, 0.45, 0]);
      k.cyl(C.brown, 0.04, 0.04, 1.6, [0, 1.1, 0], undefined, 5);
      k.tri(C.white, 1.1, 1.2, 0.04, [-0.05, 1.0, 0.02]);
      k.tri(C.cream, 0.6, 0.7, 0.04, [0.65, 0.85, 0.02], [0, 0, -0.1]);
      k.tri(C.red, 0.2, 0.15, 0.04, [0.1, 1.95, 0], [0, 0, -PI / 2]);
    },
  },
  P055: {
    name: '太陽の飾り',
    build: (k) => {
      petals(k, C.orange, 12, 0.72, 0.28, 1.0, 0);
      k.cyl(C.yellow, 0.55, 0.55, 0.14, [0, 1.0, 0], ROT_X);
      k.sph(C.black, 0.05, [-0.18, 1.08, 0.12]);
      k.sph(C.black, 0.05, [0.18, 1.08, 0.12]);
      k.sph(C.hotPink, 0.08, [0, 0.88, 0.1], [1.6, 0.6, 0.6]);
      stand(k, 0.6);
      k.box(C.lightBrown, 0.08, 0.2, 0.08, [0, 0.18, 0]);
    },
  },
  P056: {
    name: '消防車のミニカー',
    build: (k) => {
      k.box(C.red, 2.0, 0.5, 0.8, [0, 0.45, 0]);
      k.box(C.red, 0.6, 0.7, 0.8, [0.7, 0.6, 0]);
      k.box(C.sky, 0.04, 0.3, 0.6, [1.01, 0.75, 0]);
      k.box(C.white, 2.0, 0.08, 0.82, [-0.1, 0.5, 0]);
      k.box(C.silver, 1.3, 0.06, 0.1, [-0.3, 0.84, 0.2]);
      k.box(C.silver, 1.3, 0.06, 0.1, [-0.3, 0.84, -0.2]);
      for (let i = 0; i < 6; i++) k.box(C.silver, 0.04, 0.04, 0.4, [-0.9 + i * 0.22, 0.86, 0]);
      k.box(C.yellow, 0.2, 0.1, 0.3, [0.7, 1.0, 0]);
      wheels(k, [-0.6, 0.7], 0.2, 0.41, 0.22);
    },
  },
  P057: {
    name: '救急車のミニカー',
    build: (k) => {
      k.box(C.white, 2.0, 0.9, 0.8, [-0.1, 0.65, 0]);
      k.box(C.white, 0.6, 0.65, 0.8, [0.85, 0.5, 0]);
      k.box(C.sky, 0.04, 0.28, 0.6, [1.16, 0.65, 0]);
      k.box(C.red, 0.5, 0.14, 0.83, [-0.1, 0.65, 0]);
      k.box(C.red, 0.14, 0.5, 0.83, [-0.1, 0.65, 0]);
      k.box(C.red, 2.0, 0.07, 0.82, [-0.1, 0.35, 0]);
      k.box(C.blue, 0.16, 0.1, 0.3, [-0.7, 1.15, 0]);
      k.box(C.red, 0.16, 0.1, 0.3, [-0.4, 1.15, 0]);
      wheels(k, [-0.65, 0.85], 0.2, 0.41, 0.22);
    },
  },
  P058: {
    name: 'パトカーのミニカー',
    build: (k) => {
      k.box(C.black, 2.0, 0.4, 0.8, [0, 0.4, 0]);
      k.box(C.white, 0.9, 0.4, 0.82, [0, 0.4, 0]);
      k.box(C.black, 1.1, 0.4, 0.7, [-0.05, 0.78, 0]);
      k.box(C.sky, 0.9, 0.26, 0.72, [-0.05, 0.78, 0]);
      k.box(C.black, 0.3, 0.1, 0.5, [0.15, 1.02, 0]);
      k.box(C.red, 0.2, 0.12, 0.28, [-0.4, 1.06, 0.14]);
      k.box(C.blue, 0.2, 0.12, 0.28, [-0.4, 1.06, -0.14]);
      wheels(k, [-0.65, 0.65], 0.2, 0.41, 0.22);
    },
  },
  P059: {
    name: 'ロードローラーのミニカー',
    build: (k) => {
      k.box(C.yellow, 1.2, 0.5, 0.8, [0.2, 0.75, 0]);
      k.box(C.yellow, 0.5, 0.5, 0.7, [-0.1, 1.15, 0]);
      for (const x of [-0.3, 0.3]) k.box(C.darkRed, 0.06, 0.55, 0.06, [x - 0.1, 1.45, 0.3]);
      k.box(C.darkRed, 0.9, 0.06, 0.8, [-0.1, 1.72, 0]);
      k.cyl(C.gray, 0.5, 0.5, 0.95, [1.0, 0.5, 0], ROT_X, 12);
      k.cyl(C.silver, 0.2, 0.2, 1.0, [1.0, 0.5, 0], ROT_X, 8);
      for (const s of [-1, 1]) k.cyl(C.black, 0.5, 0.5, 0.3, [-0.55, 0.5, s * 0.5], ROT_X, 12);
    },
  },
  P060: {
    name: 'ショベルカーのミニカー',
    build: (k) => {
      k.box(C.black, 1.5, 0.28, 0.35, [0, 0.14, 0.4]);
      k.box(C.black, 1.5, 0.28, 0.35, [0, 0.14, -0.4]);
      k.box(C.yellow, 1.0, 0.45, 0.9, [-0.1, 0.5, 0]);
      k.box(C.yellow, 0.5, 0.55, 0.6, [0.15, 0.95, 0.05]);
      k.box(C.sky, 0.04, 0.3, 0.4, [0.41, 1.0, 0.05]);
      k.box(C.yellow, 0.9, 0.16, 0.2, [0.8, 1.1, 0], [0, 0, 0.55]);
      k.box(C.yellow, 0.8, 0.14, 0.18, [1.35, 1.0, 0], [0, 0, -0.9]);
      k.tri(C.gray, 0.4, 0.4, 0.3, [1.65, 0.45, 0], [0, 0, 2.2]);
    },
  },
  P061: {
    name: 'ダンプカーのミニカー',
    build: (k) => {
      k.box(C.black, 2.0, 0.15, 0.7, [0, 0.35, 0]);
      k.box(C.orange, 0.65, 0.7, 0.85, [0.8, 0.7, 0]);
      k.box(C.sky, 0.04, 0.3, 0.65, [1.13, 0.8, 0]);
      k.box(C.green, 1.3, 0.1, 0.9, [-0.35, 0.55, 0], [0, 0, 0.12]);
      k.box(C.green, 1.3, 0.55, 0.06, [-0.35, 0.85, 0.45], [0, 0, 0.12]);
      k.box(C.green, 1.3, 0.55, 0.06, [-0.35, 0.85, -0.45], [0, 0, 0.12]);
      k.box(C.green, 0.06, 0.55, 0.9, [-1.0, 0.9, 0], [0, 0, 0.12]);
      wheels(k, [-0.7, -0.15, 0.85], 0.2, 0.43, 0.22);
    },
  },
  P062: {
    name: '列車の模型',
    build: (k) => {
      k.box(C.black, 2.2, 0.15, 0.7, [0, 0.3, 0]);
      k.cyl(C.green, 0.33, 0.33, 1.1, [0.55, 0.65, 0], ROT_Z, 10);
      k.box(C.red, 0.6, 0.8, 0.7, [-0.4, 0.75, 0]);
      k.box(C.darkRed, 0.7, 0.07, 0.8, [-0.4, 1.17, 0]);
      k.cyl(C.black, 0.12, 0.17, 0.4, [0.85, 1.05, 0], undefined, 7);
      k.cyl(C.gold, 0.16, 0.12, 0.08, [0.85, 1.28, 0], undefined, 7);
      k.cyl(C.gold, 0.14, 0.14, 0.14, [0.35, 0.98, 0], undefined, 7);
      k.sph(C.yellow, 0.1, [1.15, 0.65, 0]);
      wheels(k, [-0.55, -0.05, 0.5, 0.95], 0.2, 0.37, 0.2);
    },
  },
  P063: {
    name: '飛行機の模型',
    build: (k) => {
      k.cyl(C.white, 0.2, 0.2, 1.4, [0, 0.5, 0], ROT_X, 10);
      k.cone(C.red, 0.2, 0.35, [0, 0.5, 0.85], [PI / 2, 0, 0], 10);
      k.box(C.sky, 1.9, 0.06, 0.4, [0, 0.52, 0.2]);
      k.box(C.blue, 0.8, 0.05, 0.25, [0, 0.55, -0.62]);
      k.tri(C.red, 0.3, 0.45, 0.05, [0, 0.85, -0.62]);
      for (const s of [-1, 1]) {
        k.cyl(C.gray, 0.09, 0.09, 0.3, [s * 0.55, 0.38, 0.28], ROT_X, 6);
        k.sph(C.sky, 0.07, [s * 0.15, 0.62, 0.45], [1, 0.8, 1.3]);
      }
      stand(k, 0.5);
    },
  },
  P064: {
    name: 'バスのミニカー',
    build: (k) => {
      k.box(C.green, 2.3, 0.9, 0.8, [0, 0.6, 0]);
      k.box(C.cream, 2.32, 0.08, 0.82, [0, 0.45, 0]);
      for (let i = 0; i < 5; i++) k.box(C.sky, 0.3, 0.28, 0.82, [-0.85 + i * 0.4, 0.8, 0]);
      k.box(C.sky, 0.04, 0.45, 0.65, [1.16, 0.75, 0]);
      k.box(C.yellow, 0.04, 0.12, 0.4, [1.16, 1.0, 0]);
      wheels(k, [-0.75, 0.75], 0.17, 0.41, 0.2);
    },
  },
  P065: {
    name: 'ミニリュック',
    build: (k) => {
      k.box(C.green, 1.1, 1.2, 0.6, [0, 0.6, 0]);
      k.sph(C.green, 0.56, [0, 1.2, 0], [1, 0.45, 0.55]);
      k.box(C.lime, 0.8, 0.5, 0.2, [0, 0.35, 0.38]);
      k.box(C.darkGreen, 0.82, 0.12, 0.22, [0, 0.58, 0.38]);
      k.tor(C.darkGreen, 0.14, 0.03, [0, 1.42, 0]);
      for (const s of [-1, 1]) k.box(C.darkGreen, 0.1, 0.9, 0.05, [s * 0.38, 0.6, 0.31]);
      k.cyl(C.yellow, 0.07, 0.07, 0.04, [0, 0.38, 0.5], ROT_X, 6);
    },
  },
  P066: {
    name: '弁当箱のミニチュア',
    build: (k) => {
      k.box(C.red, 1.7, 0.42, 1.0, [0, 0.21, 0]);
      k.box(C.white, 0.8, 0.12, 0.85, [-0.4, 0.46, 0]);
      for (const [x, z] of [[-0.6, 0.2], [-0.3, -0.2], [-0.2, 0.25], [-0.65, -0.25]] as [number, number][]) k.sph(C.white, 0.1, [x, 0.55, z], [1, 0.7, 1]);
      k.sph(C.red, 0.07, [-0.4, 0.6, 0]);
      k.box(C.yellow, 0.4, 0.18, 0.3, [0.2, 0.5, 0.25]);
      k.cyl(C.darkRed, 0.09, 0.09, 0.4, [0.3, 0.5, -0.25], ROT_Z, 6);
      k.sph(C.green, 0.14, [0.6, 0.55, 0.0]);
      k.sph(C.green, 0.1, [0.7, 0.55, 0.25]);
      k.box(C.black, 0.08, 0.46, 1.04, [0.1, 0.23, 0]);
    },
  },
  P067: {
    name: '地球の模型',
    build: (k) => {
      k.sph(C.blue, 0.7, [0, 1.0, 0]);
      k.dot(C.green, 0.69, [0.2, 0.5, 1], 0.28, 0.4, [0, 1, 0]);
      k.dot(C.green, 0.69, [-0.6, 0.1, 0.8], 0.24, 0.4, [0, 1, 0]);
      k.dot(C.green, 0.69, [0.8, -0.2, 0.6], 0.2, 0.4, [0, 1, 0]);
      k.dot(C.white, 0.7, [0, 1, 0.1], 0.16, 0.4, [0, 1, 0]);
      k.tor(C.gold, 0.84, 0.03, [0, 1.0, 0], [0, 0.4, 0]);
      k.cyl(C.gold, 0.04, 0.04, 0.4, [0, 0.35, 0], undefined, 5);
      k.cyl(C.black, 0.4, 0.45, 0.1, [0, 0.05, 0]);
    },
  },
  P068: {
    name: 'ロケットの模型',
    build: (k) => {
      k.cyl(C.white, 0.3, 0.3, 1.2, [0, 0.9, 0]);
      k.cone(C.red, 0.3, 0.55, [0, 1.75, 0]);
      k.tor(C.blue, 0.13, 0.04, [0, 1.1, 0.29]);
      k.cyl(C.sky, 0.12, 0.12, 0.04, [0, 1.1, 0.3], ROT_X, 8);
      k.cyl(C.red, 0.31, 0.31, 0.12, [0, 0.55, 0]);
      for (const a of [0, 2.09, 4.19]) k.tri(C.red, 0.4, 0.6, 0.06, [Math.sin(a) * 0.38, 0.5, Math.cos(a) * 0.38], [0, a, 0]);
      k.cone(C.orange, 0.2, 0.4, [0, 0.1, 0], [PI, 0, 0], 6);
      k.cone(C.yellow, 0.1, 0.25, [0, 0.15, 0], [PI, 0, 0], 6);
    },
  },
  P069: {
    name: '宇宙飛行士の人形',
    build: (k) => {
      k.box(C.white, 0.7, 0.75, 0.45, [0, 0.8, 0]);
      k.sph(C.white, 0.42, [0, 1.5, 0]);
      k.sph(C.gold, 0.3, [0, 1.5, 0.2], [1.1, 0.85, 0.8]);
      k.box(C.gray, 0.55, 0.65, 0.3, [0, 0.85, -0.35]);
      k.box(C.red, 0.15, 0.1, 0.05, [-0.2, 1.0, 0.24]);
      k.box(C.blue, 0.15, 0.1, 0.05, [0.2, 1.0, 0.24]);
      for (const s of [-1, 1]) {
        k.cyl(C.white, 0.12, 0.12, 0.65, [s * 0.5, 0.85, 0.05], [0, 0, s * 0.2], 6);
        k.cyl(C.white, 0.14, 0.14, 0.55, [s * 0.2, 0.25, 0], undefined, 6);
        k.box(C.gray, 0.28, 0.14, 0.4, [s * 0.2, 0.0, 0.05]);
      }
    },
  },
  P070: {
    name: '天体望遠鏡のミニチュア',
    build: (k) => {
      k.cyl(C.white, 0.2, 0.2, 1.6, [0.3, 1.1, 0], [0, 0, 1.0], 10);
      k.cyl(C.navy, 0.25, 0.25, 0.3, [0.95, 1.55, 0], [0, 0, 1.0], 10);
      k.cyl(C.sky, 0.2, 0.2, 0.04, [1.08, 1.62, 0], [0, 0, 1.0], 10);
      k.cyl(C.gray, 0.06, 0.06, 0.5, [0.1, 1.0, 0.2], [0, 0, 1.0], 6);
      for (const [x, z] of [[-0.1, 0.0], [0.2, 0.4], [0.2, -0.4]] as [number, number][]) {
        k.cyl(C.brown, 0.04, 0.05, 1.0, [x * 0.5 + 0.1, 0.5, z * 0.7], [z * 0.5, 0, -x * 0.6], 5);
      }
      k.sph(C.gray, 0.12, [0.1, 0.9, 0]);
    },
  },
  P071: {
    name: '人工衛星の模型',
    build: (k) => {
      k.box(C.gold, 0.7, 0.7, 0.7, [0, 0.8, 0]);
      for (const s of [-1, 1]) {
        k.box(C.navy, 0.9, 0.55, 0.05, [s * 1.0, 0.8, 0]);
        for (let i = 0; i < 3; i++) k.box(C.sky, 0.03, 0.55, 0.06, [s * (0.7 + i * 0.3), 0.8, 0]);
        k.box(C.sky, 0.9, 0.03, 0.06, [s * 1.0, 0.8, 0]);
        k.cyl(C.silver, 0.03, 0.03, 0.3, [s * 0.45, 0.8, 0], ROT_Z, 4);
      }
      k.cyl(C.white, 0.03, 0.36, 0.3, [0, 1.3, 0], undefined, 8);
      k.cyl(C.silver, 0.02, 0.02, 0.3, [0, 1.55, 0], undefined, 4);
      k.sph(C.red, 0.05, [0, 1.72, 0]);
      stand(k, 0.7);
      k.cyl(C.gray, 0.04, 0.04, 0.3, [0, 0.25, 0], undefined, 5);
    },
  },
  P072: {
    name: '虹の飾り',
    build: (k) => {
      [C.red, C.orange, C.yellow, C.green, C.sky, C.purple].forEach((c, i) => k.tor(c, 1.0 - i * 0.12, 0.07, [0, 0.2, 0], undefined, PI, [1, 1, 0.8]));
      k.sph(C.white, 0.3, [-0.95, 0.25, 0.05], [1.2, 0.8, 0.8]);
      k.sph(C.white, 0.25, [-0.75, 0.2, 0.15], [1.2, 0.8, 0.8]);
      k.sph(C.white, 0.3, [0.95, 0.25, 0.05], [1.2, 0.8, 0.8]);
      k.sph(C.white, 0.25, [0.75, 0.2, 0.15], [1.2, 0.8, 0.8]);
    },
  },
  P073: {
    name: 'ヒマワリの飾り',
    build: (k) => {
      pot(k);
      k.cyl(C.darkGreen, 0.05, 0.06, 0.9, [0, 0.7, 0], undefined, 5);
      petals(k, C.yellow, 12, 0.5, 0.25, 1.55, 0);
      petals(k, C.gold, 12, 0.32, 0.2, 1.55, 0.03);
      k.cyl(C.brown, 0.28, 0.28, 0.12, [0, 1.55, 0.06], ROT_X);
      k.sph(C.darkGreen, 0.2, [0.3, 0.65, 0], [1.6, 0.3, 0.7], [0, 0, -0.4]);
    },
  },
  P074: {
    name: 'チューリップの飾り',
    build: (k) => {
      pot(k, C.hotPink);
      k.cyl(C.darkGreen, 0.04, 0.05, 1.0, [0, 0.8, 0], undefined, 5);
      k.sph(C.red, 0.3, [0, 1.5, 0], [1, 1.3, 1]);
      k.sph(C.red, 0.2, [-0.18, 1.6, 0], [0.8, 1.4, 0.8]);
      k.sph(C.darkRed, 0.2, [0.18, 1.6, 0], [0.8, 1.4, 0.8]);
      k.sph(C.green, 0.15, [-0.35, 0.9, 0], [0.7, 3.0, 0.4], [0, 0, 0.3]);
      k.sph(C.green, 0.15, [0.35, 0.85, 0], [0.7, 3.0, 0.4], [0, 0, -0.3]);
    },
  },
  P075: {
    name: '桜の飾り',
    build: (k) => {
      k.cyl(C.brown, 0.07, 0.1, 1.5, [-0.2, 0.75, 0], [0, 0, -0.15], 5);
      k.cyl(C.brown, 0.04, 0.06, 0.8, [0.2, 1.3, 0], [0, 0, -0.9], 5);
      k.cyl(C.brown, 0.04, 0.06, 0.7, [-0.4, 1.2, 0], [0, 0, 0.9], 5);
      for (const [x, y] of [[0.55, 1.55], [-0.7, 1.5], [-0.05, 1.7], [0.2, 1.1], [-0.4, 1.0]] as [number, number][]) {
        k.sph(C.hotPink, 0.05, [x, y, 0.1]);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * PI * 2;
          k.sph(C.pink, 0.1, [x + Math.sin(a) * 0.14, y + Math.cos(a) * 0.14, 0.04], [1, 1, 0.5]);
        }
      }
      stand(k, 0.7);
    },
  },
  P076: {
    name: 'チョウのおもちゃ',
    build: (k) => {
      for (const s of [-1, 1]) {
        k.cyl(C.orange, 0.6, 0.6, 0.05, [s * 0.55, 1.2, 0], ROT_X, 8, 0, PI * 2, [1, 1, 1.0]);
        k.sph(C.orange, 0.55, [s * 0.55, 1.25, 0], [1, 1.0, 0.1]);
        k.sph(C.yellow, 0.4, [s * 0.5, 0.55, 0], [1, 0.9, 0.1]);
        k.sph(C.black, 0.12, [s * 0.65, 1.35, 0.04], [1, 1, 0.4]);
        k.cyl(C.black, 0.012, 0.012, 0.35, [s * 0.12, 1.85, 0], [0, 0, -s * 0.3], 3);
      }
      k.sph(C.black, 0.12, [0, 0.9, 0], [0.8, 3.2, 0.8]);
      k.sph(C.black, 0.12, [0, 1.6, 0.0]);
      stand(k, 0.5);
      k.cyl(C.lightBrown, 0.03, 0.03, 0.5, [0, 0.3, 0], undefined, 4);
    },
  },
  P077: {
    name: 'ミツバチのおもちゃ',
    build: (k) => {
      k.sph(C.yellow, 0.55, [0, 0.7, 0], [1.2, 1.0, 0.95]);
      for (const x of [-0.25, 0.15]) k.sph(C.black, 0.52, [x, 0.7, 0], [0.18, 0.95, 0.9]);
      k.sph(C.black, 0.33, [0.65, 0.78, 0.0]);
      k.cone(C.black, 0.1, 0.25, [-0.8, 0.65, 0], [0, 0, PI / 2], 5);
      for (const s of [-1, 1]) k.sph(C.white, 0.3, [-0.1, 1.2, s * 0.3], [0.8, 1.3, 0.2], [s * 0.5, 0, 0]);
      k.sph(C.white, 0.08, [0.85, 0.88, 0.2]);
      k.sph(C.white, 0.08, [0.85, 0.88, -0.2]);
      stand(k, 0.7);
    },
  },
  P078: {
    name: 'どんぐりの飾り',
    build: (k) => {
      k.sph(C.lightBrown, 0.45, [0, 0.5, 0], [0.9, 1.25, 0.9]);
      k.sph(C.brown, 0.52, [0, 1.0, 0], [1, 0.65, 1]);
      k.cyl(C.brown, 0.05, 0.07, 0.2, [0, 1.35, 0], undefined, 5);
      k.cone(C.lightBrown, 0.05, 0.12, [0, 0.02, 0], [PI, 0, 0], 5);
      k.dot(C.white, 0.45, [-0.4, 0.3, 1], 0.06, 0.3, [0, 0.5, 0]);
    },
  },
  P079: {
    name: 'テントウムシのおもちゃ',
    build: (k) => {
      k.sph(C.red, 0.7, [0, 0.4, -0.1], [1.0, 0.75, 1.0]);
      k.sph(C.black, 0.3, [0, 0.4, 0.75], [1.1, 0.8, 0.9]);
      k.box(C.black, 0.04, 0.5, 1.3, [0, 0.5, -0.1]);
      for (const d of [[0.6, 0.6, 0.3], [-0.6, 0.6, 0.3], [0.7, 0.5, -0.5], [-0.7, 0.5, -0.5], [0.3, 0.9, -0.2], [-0.3, 0.9, -0.2]] as V3[]) {
        k.dot(C.black, 0.62, d, 0.14, 0.4, [0, 0.4, -0.1]);
      }
      k.sph(C.white, 0.06, [0.15, 0.5, 0.95]);
      k.sph(C.white, 0.06, [-0.15, 0.5, 0.95]);
    },
  },
  P080: {
    name: 'ラッパのおもちゃ',
    build: (k) => {
      k.cyl(C.gold, 0.55, 0.08, 0.9, [0.95, 0.7, 0], [0, 0, -PI / 2], 12);
      k.cyl(C.gold, 0.08, 0.08, 1.7, [0, 0.7, 0], ROT_Z, 8);
      k.cyl(C.gold, 0.1, 0.1, 0.2, [-0.9, 0.7, 0], ROT_Z, 8);
      k.tor(C.gold, 0.28, 0.06, [-0.2, 0.45, 0], undefined, PI * 1.9, [1, 1, 1]);
      for (const x of [-0.25, 0, 0.25]) {
        k.cyl(C.gold, 0.05, 0.05, 0.28, [x, 0.9, 0], undefined, 6);
        k.cyl(C.red, 0.08, 0.08, 0.05, [x, 1.07, 0], undefined, 6);
      }
      stand(k, 0.7);
    },
  },
  P081: {
    name: 'タンバリンのおもちゃ',
    build: (k) => {
      k.tor(C.lightBrown, 0.75, 0.13, [0, 0.9, 0]);
      k.cyl(C.cream, 0.7, 0.7, 0.04, [0, 0.9, 0], ROT_X);
      k.sph(C.hotPink, 0.18, [0, 0.9, 0.08], [1, 1, 0.3]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        k.cyl(C.gold, 0.17, 0.17, 0.03, [Math.sin(a) * 0.75, 0.9 + Math.cos(a) * 0.75, 0.06], ROT_X, 8);
        k.cyl(C.gold, 0.17, 0.17, 0.03, [Math.sin(a) * 0.75, 0.9 + Math.cos(a) * 0.75, -0.06], ROT_X, 8);
      }
      stand(k, 0.6);
      k.box(C.lightBrown, 0.08, 0.2, 0.08, [0, 0.15, 0]);
    },
  },
  P082: {
    name: 'ピアノのミニチュア',
    build: (k) => {
      k.box(C.black, 1.7, 1.2, 0.7, [0, 0.8, -0.1]);
      k.box(C.black, 1.8, 0.08, 0.8, [0, 1.42, -0.1]);
      k.box(C.white, 1.5, 0.1, 0.4, [0, 0.8, 0.4]);
      for (let i = -3; i <= 3; i++) k.box(C.black, 0.07, 0.07, 0.24, [i * 0.2 + 0.1, 0.89, 0.34]);
      k.box(C.lightGray, 1.3, 0.35, 0.04, [0, 1.15, 0.26]);
      for (const s of [-1, 1]) k.box(C.black, 0.12, 0.5, 0.5, [s * 0.72, 0.25, 0.1]);
      k.box(C.gold, 0.2, 0.08, 0.05, [0, 0.4, 0.3]);
    },
  },
  P083: {
    name: 'ギターのミニチュア',
    build: (k) => {
      k.cyl(C.orange, 0.55, 0.55, 0.28, [0, 0.55, 0], ROT_X, 12);
      k.cyl(C.orange, 0.42, 0.42, 0.28, [0, 1.15, 0], ROT_X, 12);
      k.cyl(C.black, 0.15, 0.15, 0.3, [0, 0.85, 0], ROT_X, 8);
      k.box(C.brown, 0.28, 0.07, 0.3, [0, 0.3, 0]);
      k.box(C.brown, 0.14, 1.2, 0.1, [0, 1.95, 0]);
      k.box(C.brown, 0.26, 0.35, 0.09, [0, 2.65, 0]);
      for (const x of [-0.04, 0.04]) k.box(C.cream, 0.012, 1.7, 0.012, [x, 1.4, 0.16]);
      for (const y of [2.55, 2.75]) {
        k.sph(C.silver, 0.04, [-0.17, y, 0]);
        k.sph(C.silver, 0.04, [0.17, y, 0]);
      }
    },
  },
  P084: {
    name: 'マラカスのおもちゃ',
    build: (k) => {
      for (const [s, c, c2] of [[-1, C.red, C.yellow], [1, C.blue, C.sky]] as [number, number, number][]) {
        k.sph(c, 0.4, [s * 0.5, 1.2, 0], [0.9, 1.15, 0.9], [0, 0, -s * 0.3]);
        k.tor(c2, 0.36, 0.05, [s * 0.5, 1.2, 0], [PI / 2, 0, 0.0]);
        k.cyl(C.lightBrown, 0.07, 0.09, 0.9, [s * 0.35, 0.45, 0], [0, 0, -s * 0.3], 6);
        k.sph(c2, 0.1, [s * 0.2, 0.0, 0]);
      }
      stand(k, 0.9);
    },
  },
  P085: {
    name: 'ミニサッカーボール',
    build: (k) => {
      k.sph(C.white, 0.7, [0, 0.7, 0]);
      const ds: V3[] = [[0, 0.1, 1], [0.95, 0.1, 0.35], [-0.95, 0.1, 0.35], [0.55, 0.9, 0.4], [-0.55, 0.9, 0.4], [0.5, -0.8, 0.5], [-0.5, -0.8, 0.5], [0, 0.2, -1]];
      for (const d of ds) k.dot(C.black, 0.7, d, 0.22, 0.25, [0, 0.7, 0]);
    },
  },
  P086: {
    name: '野球ボールのおもちゃ',
    build: (k) => {
      k.sph(C.white, 0.7, [0, 0.7, 0]);
      for (const s of [-1, 1]) {
        k.tor(C.red, 0.5, 0.035, [s * 0.46, 0.7, 0], [0, PI / 2, 0], PI * 1.3);
        for (let i = 0; i < 5; i++) k.box(C.red, 0.12, 0.025, 0.025, [s * 0.5, 0.7 + (i - 2) * 0.17, 0.3 + Math.abs(i - 2) * -0.02], [0, 0, s * 0.8]);
      }
    },
  },
  P087: {
    name: 'ミニバスケットボール',
    build: (k) => {
      k.sph(C.orange, 0.7, [0, 0.7, 0]);
      k.tor(C.black, 0.705, 0.025, [0, 0.7, 0], [0, 0, 0]);
      k.tor(C.black, 0.705, 0.025, [0, 0.7, 0], [0, PI / 2, 0]);
      k.tor(C.black, 0.705, 0.025, [0, 0.7, 0], [PI / 2, 0, 0]);
      for (const s of [-1, 1]) k.tor(C.black, 0.62, 0.025, [s * 0.6, 0.7, 0], [0, PI / 2, 0], PI * 2);
    },
  },
  P088: {
    name: 'トランプ',
    build: (k) => {
      for (const [i, a] of [-0.5, -0.15, 0.2, 0.55].entries()) {
        const x = Math.sin(-a) * -0.6;
        const y = 0.65 + Math.cos(a) * 0.1;
        k.box(i === 0 ? C.blue : C.white, 0.7, 1.0, 0.025, [x, y, i * 0.03], [0, 0, -a]);
        if (i > 0) {
          k.box(i === 2 ? C.black : C.red, 0.16, 0.16, 0.03, [x - 0.15 * Math.cos(a), y + 0.25, i * 0.03 + 0.01], [0, 0, -a + PI / 4]);
        } else k.box(C.sky, 0.45, 0.7, 0.03, [x, y, 0.016], [0, 0, -a]);
      }
      stand(k, 0.7, C.red);
    },
  },
  P089: {
    name: 'おにぎりの食品模型',
    build: (k) => {
      k.tri(C.white, 1.3, 1.1, 0.8, [0, 0.6, 0]);
      k.sph(C.white, 0.35, [0, 0.45, 0], [1.6, 1.1, 1.1]);
      k.box(C.black, 0.6, 0.42, 0.84, [0, 0.21, 0]);
      k.sph(C.darkRed, 0.07, [0, 1.0, 0.4]);
      k.cyl(C.white, 0.8, 0.8, 0.04, [0, -0.01, 0]);
    },
  },
  P090: {
    name: '卵焼きの食品模型',
    build: (k) => {
      k.cyl(C.white, 1.0, 0.9, 0.05, [0, 0.03, 0], undefined, 12);
      for (const [i, x] of [-0.4, 0.05, 0.5].entries()) {
        k.box(C.yellow, 0.4, 0.3, 0.7, [x, 0.2 + i * 0.0, 0], [0, 0, i * 0.04]);
        k.box(C.orange, 0.38, 0.04, 0.72, [x, 0.14, 0]);
        k.box(C.orange, 0.38, 0.04, 0.72, [x, 0.27, 0]);
      }
      k.sph(C.lime, 0.15, [0.7, 0.2, -0.3]);
    },
  },
  P091: {
    name: '食パンの食品模型',
    build: (k) => {
      k.box(C.lightBrown, 1.1, 0.8, 0.35, [0, 0.4, 0]);
      k.sph(C.lightBrown, 0.33, [-0.35, 0.8, 0], [1.25, 0.9, 1.0]);
      k.sph(C.lightBrown, 0.33, [0.35, 0.8, 0], [1.25, 0.9, 1.0]);
      k.box(C.cream, 0.88, 0.62, 0.04, [0, 0.4, 0.19]);
      k.sph(C.cream, 0.27, [-0.3, 0.78, 0.19], [1.2, 0.85, 0.12]);
      k.sph(C.cream, 0.27, [0.3, 0.78, 0.19], [1.2, 0.85, 0.12]);
    },
  },
  P092: {
    name: '目玉焼きの食品模型',
    build: (k) => {
      k.cyl(C.sky, 0.95, 0.85, 0.06, [0, 0.03, 0], undefined, 12);
      k.sph(C.white, 0.5, [-0.15, 0.1, 0.05], [1.3, 0.25, 1.0]);
      k.sph(C.white, 0.4, [0.35, 0.1, -0.1], [1.2, 0.25, 1.0]);
      k.sph(C.white, 0.35, [0, 0.1, 0.35], [1.2, 0.25, 1.0]);
      k.sph(C.yellow, 0.26, [-0.05, 0.2, 0.05], [1, 0.8, 1]);
      k.sph(C.orange, 0.08, [-0.12, 0.34, 0.12], [1, 0.4, 1]);
    },
  },
  P093: {
    name: 'ハンバーガーの食品模型',
    build: (k) => {
      k.cyl(C.lightBrown, 0.7, 0.62, 0.22, [0, 0.11, 0], undefined, 12);
      k.cyl(C.brown, 0.72, 0.72, 0.2, [0, 0.32, 0], undefined, 12);
      k.box(C.yellow, 1.0, 0.04, 1.0, [0, 0.45, 0], [0, PI / 4, 0]);
      k.cyl(C.red, 0.6, 0.6, 0.06, [0, 0.52, 0], undefined, 12);
      k.cyl(C.lime, 0.78, 0.78, 0.07, [0, 0.6, 0], undefined, 8);
      k.sph(C.lightBrown, 0.72, [0, 0.62, 0], [1, 0.75, 1]);
      for (const [x, z] of [[-0.3, 0.2], [0.2, 0.3], [0.35, -0.1], [-0.1, -0.2], [0, 0.0]] as [number, number][]) k.sph(C.cream, 0.05, [x, 1.05 - (x * x + z * z) * 0.4, z], [1.3, 0.6, 0.8]);
    },
  },
  P094: {
    name: 'フライドポテトの食品模型',
    build: (k) => {
      for (const [i, x] of [-0.4, -0.2, 0, 0.2, 0.4, -0.3, 0.3].entries()) {
        k.box(C.yellow, 0.14, 0.8 + (i % 3) * 0.12, 0.14, [x, 1.0 + (i % 3) * 0.06, (i % 2 ? 0.1 : -0.1)], [0.1 * (i % 3 - 1), 0, 0.12 * (i % 4 - 1.5)]);
      }
      k.cyl(C.red, 0.62, 0.45, 0.8, [0, 0.4, 0], [0, PI / 4, 0], 4);
      k.cyl(C.yellow, 0.58, 0.5, 0.3, [0, 0.55, 0], [0, PI / 4, 0], 4);
    },
  },
  P095: {
    name: 'ピザの食品模型',
    build: (k) => {
      k.cyl(C.lightBrown, 0.85, 0.85, 0.12, [0, 1.0, 0], ROT_X, 14);
      k.cyl(C.yellow, 0.72, 0.72, 0.16, [0, 1.0, 0], ROT_X, 14);
      for (const [x, y] of [[-0.3, 1.3], [0.3, 1.2], [0, 0.9], [-0.35, 0.75], [0.4, 0.8]] as [number, number][]) k.cyl(C.red, 0.15, 0.15, 0.2, [x, y, 0], ROT_X, 8);
      for (const [x, y] of [[0.05, 1.3], [-0.2, 1.0], [0.25, 1.0]] as [number, number][]) k.cyl(C.darkGreen, 0.07, 0.07, 0.2, [x, y, 0], ROT_X, 6);
      stand(k, 0.8, C.lightBrown);
      k.box(C.lightBrown, 0.12, 0.2, 0.08, [0, 0.18, -0.1]);
    },
  },
  P096: {
    name: '皿のおもちゃ',
    build: (k) => {
      k.cyl(C.white, 0.9, 0.55, 0.14, [0, 0.07, 0], undefined, 14);
      k.cyl(C.hotPink, 0.7, 0.7, 0.16, [0, 0.08, 0], undefined, 14);
      k.cyl(C.white, 0.62, 0.62, 0.18, [0, 0.08, 0], undefined, 14);
      k.tor(C.blue, 0.8, 0.03, [0, 0.13, 0], ROT_X);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        k.sph(C.sky, 0.07, [Math.sin(a) * 0.78, 0.15, Math.cos(a) * 0.78]);
      }
      k.sph(C.yellow, 0.12, [0, 0.2, 0], [1, 0.4, 1]);
    },
  },
  P097: {
    name: 'フォークのおもちゃ',
    build: (k) => {
      k.box(C.silver, 0.5, 0.1, 0.1, [0, 1.3, 0]);
      for (const x of [-0.2, -0.067, 0.067, 0.2]) k.box(C.silver, 0.08, 0.55, 0.1, [x, 1.62, 0]);
      k.box(C.silver, 0.2, 0.3, 0.1, [0, 1.1, 0]);
      k.box(C.red, 0.16, 0.9, 0.12, [0, 0.55, 0]);
      k.sph(C.red, 0.14, [0, 0.1, 0], [1.2, 0.8, 0.9]);
      stand(k, 0.7);
    },
  },
  P098: {
    name: 'フライパンのおもちゃ',
    build: (k) => {
      k.cyl(C.black, 0.75, 0.62, 0.2, [-0.25, 0.1, 0], undefined, 14);
      k.cyl(C.gray, 0.6, 0.6, 0.22, [-0.25, 0.1, 0], undefined, 14);
      k.box(C.red, 1.0, 0.08, 0.2, [0.95, 0.18, 0]);
      k.sph(C.red, 0.12, [1.45, 0.18, 0], [1.3, 0.7, 1]);
      k.sph(C.white, 0.22, [-0.25, 0.22, 0], [1.2, 0.2, 1]);
      k.sph(C.yellow, 0.1, [-0.25, 0.27, 0], [1, 0.6, 1]);
    },
  },
  P099: {
    name: '鍋のおもちゃ',
    build: (k) => {
      k.cyl(C.red, 0.75, 0.7, 0.75, [0, 0.4, 0], undefined, 12);
      k.cyl(C.silver, 0.78, 0.78, 0.1, [0, 0.81, 0], undefined, 12);
      k.sph(C.silver, 0.72, [0, 0.82, 0], [1, 0.3, 1]);
      k.sph(C.black, 0.12, [0, 1.06, 0]);
      for (const s of [-1, 1]) k.box(C.black, 0.28, 0.1, 0.14, [s * 0.88, 0.62, 0]);
      for (const d of [[0.5, 0.4, 1], [-0.4, 0.6, 1], [0.2, 0.7, 1]] as V3[]) k.dot(C.white, 0.74, [d[0], d[1] - 0.2, d[2]], 0.06, 0.3);
    },
  },
  P100: {
    name: 'スプーンのおもちゃ',
    build: (k) => {
      k.sph(C.silver, 0.38, [0, 1.4, 0], [1, 1.35, 0.35]);
      k.sph(C.lightGray, 0.26, [0, 1.42, 0.06], [1, 1.25, 0.3]);
      k.box(C.silver, 0.12, 0.35, 0.08, [0, 0.95, 0]);
      k.box(C.blue, 0.2, 0.85, 0.12, [0, 0.5, 0]);
      k.sph(C.blue, 0.16, [0, 0.07, 0], [1.2, 0.8, 0.9]);
      stand(k, 0.7);
    },
  },
};

export const PRIZE_RECIPE_IDS: readonly string[] = Object.keys(PRIZE_RECIPES);
