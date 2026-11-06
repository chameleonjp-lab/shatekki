/**
 * Traditional Chinese (Taiwan usage) texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { ZH_HANT_PAIR_CLUES, ZH_HANT_PAIR_NAMES } from './zh-Hant-pairs';
import { ZH_HANT_QUESTIONS } from './zh-Hant-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
ZH_HANT_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
ZH_HANT_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}。需要2種。`;
});

const questions: Record<string, ExpandedQuestionText> = {};
ZH_HANT_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  '獲得1發彈', '獲得2發彈', '獲得3發彈', '稍微好削的彈', '很會削的彈',
  '稍微好推的彈', '用力推的彈', '恰到好處的強擊', '紮實的強擊', '稍快的彈',
  '快速的彈', '更穩的瞄準', '更加穩的瞄準', '稍微不易下墜', '低拋物線的彈',
  '換成彈跳彈', '換成重彈', '更集中的分裂', '雙向彈', '多留一次反彈餘量',
  // 021-040
  '失去1發彈', '失去2發彈', '失去3發彈', '不易削的彈', '軟綿綿的彈',
  '不易推的彈', '輕推的彈', '樸素的單發彈', '稍慢的彈', '慢速的彈',
  '稍帶拋物線的彈', '拋物線的彈', '不太彈跳的彈', '很快失去衝勁', '瞄準略有抖動',
  '瞄準抖動', '蓄力條變快', '蓄力條變慢', '更分散的分裂', '少兩次反彈',
  // 041-060
  '糖果店陣容', '下午茶陣容', '夏日廟會陣容', '懷舊遊戲陣容', '身邊動物陣容',
  '動物園陣容', '森林風景陣容', '海洋生物陣容', '旅行交通工具陣容', '工作車輛陣容',
  '出遊裝備陣容', '太空探索陣容', '天空風景陣容', '花園陣容', '小蟲陣容',
  '音樂會陣容', '大家的遊戲陣容', '早餐與便當陣容', '小吃店陣容', '過家家廚房陣容',
  // 061-080
  '標出糖果店', '標出下午茶', '標出夏日廟會', '標出懷舊遊戲', '標出身邊動物',
  '標出動物園', '標出森林風景', '標出海洋生物', '標出旅行交通工具', '標出工作車輛',
  '標出出遊裝備', '標出太空探索', '標出天空風景', '標出花園', '標出小蟲',
  '標出音樂會', '標出大家的遊戲', '標出早餐與便當', '標出小吃店', '標出過家家廚房',
  // 081-100
  '換回普通彈', '下一發照常', '粗軟木塞', '細軟木塞', '貼近的雙向彈',
  '三向彈', '偏重削的彈', '偏重推的彈', '快卻輕的一發', '讓一件獎品變得一樣',
  '讓一件獎品回到原來的種類', '再來一個贏到的種類', '耐久示意圖', '再差一種的線索', '這局還沒拿到的獎品',
  '同種類集中檢視', '檢視移動週期', '首次命中的預估', '顯示飛行路徑', '瞄準角度刻度',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '增加了{n}發彈', '增加了{n}發彈', '增加了{n}發彈',
  '下一發稍微更會削', '下一發更會削',
  '下一發稍微更會推', '下一發推得更用力',
  '下一發的削推力稍微增強', '下一發的削推力大幅增強',
  '下一發飛得稍快', '下一發飛得更快',
  '下一發瞄準搖晃減少', '下一發瞄準搖晃大減',
  '下一發稍微不易下墜', '下一發以低拋物線飛出',
  '下一發是彈跳彈', '下一發是重彈',
  '若下一發分裂，會更集中', '下一發分裂成兩個方向',
  '下一發可以多反彈一次',
  // 021-040
  '減少了{n}發彈', '減少了{n}發彈', '減少了{n}發彈',
  '下一發削得更少', '下一發削得少很多',
  '下一發推得更少', '下一發推得少很多',
  '下一發的削推力稍微減弱',
  '下一發飛得稍慢', '下一發飛得很慢',
  '下一發的拋物線稍大', '下一發的拋物線很高',
  '下一發彈跳稍少', '下一發很快失去衝勁',
  '下一發瞄準搖晃稍增', '下一發瞄準搖晃增加',
  '下一次蓄力條走得稍快', '下一次蓄力條走得很慢',
  '若下一發分裂，會更分散', '下一發少反彈兩次',
  // 041-060
  ...Array.from({ length: 20 }, () => '剩下的獎品換成了“{series}”陣容。已經拿到的獎品保持不變'),
  // 061-080
  ...Array.from({ length: 20 }, () => '“{series}”的獎品現在帶有對應顏色的描邊和符號。陣容不變'),
  // 081-100
  '下一發恢復為普通彈', '下一發恢復為平常的樣子',
  '下一發的軟木塞稍粗', '下一發的軟木塞稍細',
  '下一發分裂成兩個相近的方向', '下一發分裂成三個方向',
  '下一發更會削但推得更少', '下一發更會推但削得更少',
  '下一發飛得快但推得更少',
  '一件獎品變成了和另一件獎品同種類',
  '一件獎品回到了放置時的種類',
  '一件獎品變成了你上次拿到的種類',
  '下一發會顯示獎品的耐久',
  '下一發會出現差一種類的套裝線索',
  '下一發會標出這局還沒拿到的獎品',
  '下一發同種類獎品會顯示名稱和數量',
  '下一發會顯示移動獎品的移動週期',
  '下一發會出現首次命中的參考。僅供參考，可能有出入',
  '之後，下一發的飛行路徑會更容易看清',
  '下一發的瞄準處會出現角度刻度',
];

const seriesLabels: Record<string, string> = {
  SER01: '糖果店', SER02: '下午茶', SER03: '夏日廟會', SER04: '懷舊遊戲', SER05: '身邊動物',
  SER06: '動物園', SER07: '森林風景', SER08: '海洋生物', SER09: '旅行交通工具', SER10: '工作車輛',
  SER11: '出遊裝備', SER12: '太空探索', SER13: '天空風景', SER14: '花園', SER15: '小蟲',
  SER16: '音樂會', SER17: '大家的遊戲', SER18: '早餐與便當', SER19: '小吃店', SER20: '過家家廚房',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[糖果]', SER02: '[茶會]', SER03: '[廟會]', SER04: '[懷舊]', SER05: '[寵物]',
  SER06: '[動物園]', SER07: '[森林]', SER08: '[海洋]', SER09: '[旅行]', SER10: '[工程]',
  SER11: '[出遊]', SER12: '[太空]', SER13: '[天空]', SER14: '[花園]', SER15: '[小蟲]',
  SER16: '[音樂]', SER17: '[遊戲]', SER18: '[餐點]', SER19: '[小吃]', SER20: '[廚房]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const ZH_HANT_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: '增加彈數，或換一種彈',
    RISK: '不論是強化還是挫折，聽天由命',
    STOCK: '更換獎品系列',
    GUIDE: '標出某個系列的獎品',
    MIX: '各種花招與指引',
    CHAOS: '什麼都可能，交給命運',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: '現在沒有可用的效果',
    effectNotApplicable: '這次沒能使用這個效果',
    noOutlineTarget: '現在沒有目標獎品',
    sideEffectTemporaryOutsideSeries: '有的獎品可能暫時不在該系列內',
  },
};
