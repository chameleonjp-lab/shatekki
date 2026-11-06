/**
 * Simplified Chinese texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { ZH_HANS_PAIR_CLUES, ZH_HANS_PAIR_NAMES } from './zh-Hans-pairs';
import { ZH_HANS_QUESTIONS } from './zh-Hans-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
ZH_HANS_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
ZH_HANS_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}。需要2种。`;
});

const questions: Record<string, ExpandedQuestionText> = {};
ZH_HANS_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  '获得1发弹', '获得2发弹', '获得3发弹', '稍微好削的弹', '很会削的弹',
  '稍微好推的弹', '用力推的弹', '恰到好处的强击', '扎实的强击', '稍快的弹',
  '快速的弹', '更稳的瞄准', '更加稳的瞄准', '稍微不易下坠', '低抛物线的弹',
  '换成弹跳弹', '换成重弹', '更集中的分裂', '双向弹', '多留一次反弹余量',
  // 021-040
  '失去1发弹', '失去2发弹', '失去3发弹', '不易削的弹', '软绵绵的弹',
  '不易推的弹', '轻推的弹', '朴素的单发弹', '稍慢的弹', '慢速的弹',
  '稍带抛物线的弹', '抛物线的弹', '不太弹跳的弹', '很快失去冲劲', '瞄准略有抖动',
  '瞄准抖动', '蓄力条变快', '蓄力条变慢', '更分散的分裂', '少两次反弹',
  // 041-060
  '糖果店阵容', '下午茶阵容', '夏日庙会阵容', '怀旧游戏阵容', '身边动物阵容',
  '动物园阵容', '森林风景阵容', '海洋生物阵容', '旅行交通工具阵容', '工作车辆阵容',
  '出游装备阵容', '太空探索阵容', '天空风景阵容', '花园阵容', '小虫阵容',
  '音乐会阵容', '大家的游戏阵容', '早餐与便当阵容', '小吃店阵容', '过家家厨房阵容',
  // 061-080
  '标出糖果店', '标出下午茶', '标出夏日庙会', '标出怀旧游戏', '标出身边动物',
  '标出动物园', '标出森林风景', '标出海洋生物', '标出旅行交通工具', '标出工作车辆',
  '标出出游装备', '标出太空探索', '标出天空风景', '标出花园', '标出小虫',
  '标出音乐会', '标出大家的游戏', '标出早餐与便当', '标出小吃店', '标出过家家厨房',
  // 081-100
  '换回普通弹', '下一发照常', '粗软木塞', '细软木塞', '贴近的双向弹',
  '三向弹', '偏重削的弹', '偏重推的弹', '快却轻的一发', '让一件奖品变得一样',
  '让一件奖品回到原来的种类', '再来一个赢到的种类', '耐久示意图', '再差一种的线索', '这局还没拿到的奖品',
  '同种类集中查看', '查看移动周期', '首次命中的预估', '显示飞行路径', '瞄准角度刻度',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '增加了{n}发弹', '增加了{n}发弹', '增加了{n}发弹',
  '下一发稍微更会削', '下一发更会削',
  '下一发稍微更会推', '下一发推得更用力',
  '下一发的削推力稍微增强', '下一发的削推力大幅增强',
  '下一发飞得稍快', '下一发飞得更快',
  '下一发瞄准摇晃减少', '下一发瞄准摇晃大减',
  '下一发稍微不易下坠', '下一发以低抛物线飞出',
  '下一发是弹跳弹', '下一发是重弹',
  '若下一发分裂，会更集中', '下一发分裂成两个方向',
  '下一发可以多反弹一次',
  // 021-040
  '减少了{n}发弹', '减少了{n}发弹', '减少了{n}发弹',
  '下一发削得更少', '下一发削得少很多',
  '下一发推得更少', '下一发推得少很多',
  '下一发的削推力稍微减弱',
  '下一发飞得稍慢', '下一发飞得很慢',
  '下一发的抛物线稍大', '下一发的抛物线很高',
  '下一发弹跳稍少', '下一发很快失去冲劲',
  '下一发瞄准摇晃稍增', '下一发瞄准摇晃增加',
  '下一次蓄力条走得稍快', '下一次蓄力条走得很慢',
  '若下一发分裂，会更分散', '下一发少反弹两次',
  // 041-060
  ...Array.from({ length: 20 }, () => '剩下的奖品换成了“{series}”阵容。已经拿到的奖品保持不变'),
  // 061-080
  ...Array.from({ length: 20 }, () => '“{series}”的奖品现在带有对应颜色的描边和符号。阵容不变'),
  // 081-100
  '下一发恢复为普通弹', '下一发恢复为平常的样子',
  '下一发的软木塞稍粗', '下一发的软木塞稍细',
  '下一发分裂成两个相近的方向', '下一发分裂成三个方向',
  '下一发更会削但推得更少', '下一发更会推但削得更少',
  '下一发飞得快但推得更少',
  '一件奖品变成了和另一件奖品同种类',
  '一件奖品回到了放置时的种类',
  '一件奖品变成了你上次拿到的种类',
  '下一发会显示奖品的耐久',
  '下一发会出现差一种类的套装线索',
  '下一发会标出这局还没拿到的奖品',
  '下一发同种类奖品会显示名称和数量',
  '下一发会显示移动奖品的移动周期',
  '下一发会出现首次命中的参考。仅供参考，可能有出入',
  '之后，下一发的飞行路径会更容易看清',
  '下一发的瞄准处会出现角度刻度',
];

const seriesLabels: Record<string, string> = {
  SER01: '糖果店', SER02: '下午茶', SER03: '夏日庙会', SER04: '怀旧游戏', SER05: '身边动物',
  SER06: '动物园', SER07: '森林风景', SER08: '海洋生物', SER09: '旅行交通工具', SER10: '工作车辆',
  SER11: '出游装备', SER12: '太空探索', SER13: '天空风景', SER14: '花园', SER15: '小虫',
  SER16: '音乐会', SER17: '大家的游戏', SER18: '早餐与便当', SER19: '小吃店', SER20: '过家家厨房',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[糖果]', SER02: '[茶会]', SER03: '[庙会]', SER04: '[怀旧]', SER05: '[宠物]',
  SER06: '[动物园]', SER07: '[森林]', SER08: '[海洋]', SER09: '[旅行]', SER10: '[工程]',
  SER11: '[出游]', SER12: '[太空]', SER13: '[天空]', SER14: '[花园]', SER15: '[小虫]',
  SER16: '[音乐]', SER17: '[游戏]', SER18: '[餐点]', SER19: '[小吃]', SER20: '[厨房]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const ZH_HANS_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: '增加弹数，或换一种弹',
    RISK: '不论是强化还是挫折，听天由命',
    STOCK: '更换奖品系列',
    GUIDE: '标出某个系列的奖品',
    MIX: '各种花招与指引',
    CHAOS: '什么都可能，交给命运',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: '现在没有可用的效果',
    effectNotApplicable: '这次没能使用这个效果',
    noOutlineTarget: '现在没有目标奖品',
    sideEffectTemporaryOutsideSeries: '有的奖品可能暂时不在该系列内',
  },
};
