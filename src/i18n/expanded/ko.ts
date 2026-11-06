/**
 * Korean texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { KO_PAIR_CLUES, KO_PAIR_NAMES } from './ko-pairs';
import { KO_QUESTIONS } from './ko-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
KO_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
KO_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. 2종류가 필요해요.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
KO_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  '코르크 1발 받기', '코르크 2발 받기', '코르크 3발 받기', '조금 더 깎는 샷', '많이 깎는 샷',
  '조금 더 미는 샷', '세게 미는 샷', '제법 힘 있는 타격', '든든한 힘의 타격', '조금 빠른 샷',
  '빠른 샷', '더 안정된 조준', '훨씬 안정된 조준', '낙하 조금 줄이기', '낮은 포물선 샷',
  '튀는 샷으로 전환', '무거운 샷으로 전환', '더 좁은 갈라짐', '두 방향 샷', '튕김 한 번 여유',
  // 021-040
  '코르크 1발 잃기', '코르크 2발 잃기', '코르크 3발 잃기', '잘 안 깎이는 샷', '무른 샷',
  '잘 안 밀리는 샷', '살살 미는 샷', '소박한 단발 샷', '조금 느린 샷', '느린 샷',
  '조금 휘는 샷', '휘는 샷', '덜 튀는 샷', '기세가 빨리 죽는 샷', '조금 흔들리는 조준',
  '흔들리는 조준', '빨리 차는 게이지', '느리게 차는 게이지', '더 넓은 갈라짐', '튕김 두 번 감소',
  // 041-060
  '과자 가게 구성', '티파티 구성', '여름 축제 구성', '옛날 놀이 구성', '친숙한 동물 구성',
  '동물원 구성', '숲 풍경 구성', '바다 생물 구성', '여행 탈것 구성', '일하는 차량 구성',
  '나들이 도구 구성', '우주 탐사 구성', '하늘 풍경 구성', '꽃 정원 구성', '작은 벌레 구성',
  '콘서트 구성', '모두의 놀이 구성', '아침 식사와 도시락 구성', '간식 가게 구성', '소꿉 부엌 구성',
  // 061-080
  '과자 가게 찾기', '티파티 찾기', '여름 축제 찾기', '옛날 놀이 찾기', '친숙한 동물 찾기',
  '동물원 찾기', '숲 풍경 찾기', '바다 생물 찾기', '여행 탈것 찾기', '일하는 차량 찾기',
  '나들이 도구 찾기', '우주 탐사 찾기', '하늘 풍경 찾기', '꽃 정원 찾기', '작은 벌레 찾기',
  '콘서트 찾기', '모두의 놀이 찾기', '아침 식사와 도시락 찾기', '간식 가게 찾기', '소꿉 부엌 찾기',
  // 081-100
  '평범한 샷으로 복귀', '다음 샷은 평소대로', '두꺼운 코르크', '얇은 코르크', '가까운 두 갈래 샷',
  '세 방향 샷', '깎기 중심 샷', '밀기 중심 샷', '빠르지만 가벼운 샷', '경품 하나를 다른 경품에 맞추기',
  '경품 하나가 원래 종류로 복귀', '얻은 종류 하나 더', '내구도 지도', '한 종류 더의 힌트', '이번 판 미획득 표시',
  '같은 종류 함께 보기', '움직임 주기 보기', '첫 타격 예상', '비행 경로 표시', '조준 각도 눈금',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '코르크가 {n}발 늘었어요', '코르크가 {n}발 늘었어요', '코르크가 {n}발 늘었어요',
  '다음 샷은 조금 더 깎아요', '다음 샷은 더 많이 깎아요',
  '다음 샷은 조금 더 밀어요', '다음 샷은 더 세게 밀어요',
  '다음 샷은 깎고 미는 힘이 조금 늘어요', '다음 샷은 깎고 미는 힘이 많이 늘어요',
  '다음 샷은 조금 더 빨리 날아가요', '다음 샷은 더 빨리 날아가요',
  '다음 샷은 조준이 덜 흔들려요', '다음 샷은 조준이 훨씬 덜 흔들려요',
  '다음 샷은 낙하가 조금 줄어요', '다음 샷은 낮은 포물선으로 날아가요',
  '다음 샷은 튀는 샷이에요', '다음 샷은 무거운 샷이에요',
  '이어서 갈라지면 간격이 좁아져요', '다음 샷은 두 방향으로 갈라져요',
  '다음 샷은 한 번 더 튕길 수 있어요',
  // 021-040
  '코르크가 {n}발 줄었어요', '코르크가 {n}발 줄었어요', '코르크가 {n}발 줄었어요',
  '다음 샷은 덜 깎아요', '다음 샷은 훨씬 덜 깎아요',
  '다음 샷은 덜 밀어요', '다음 샷은 훨씬 덜 밀어요',
  '다음 샷은 깎고 미는 힘이 조금 줄어요',
  '다음 샷은 조금 더 느리게 날아가요', '다음 샷은 느리게 날아가요',
  '다음 샷은 조금 더 휘어요', '다음 샷은 높게 휘어요',
  '다음 샷은 조금 덜 튀어요', '다음 샷은 기세가 빨리 죽어요',
  '다음 샷은 조준이 조금 더 흔들려요', '다음 샷은 조준이 더 흔들려요',
  '다음 게이지가 조금 빨리 차올라요', '다음 게이지가 느리게 차올라요',
  '이어서 갈라지면 간격이 넓어져요', '다음 샷은 튕김이 두 번 줄어요',
  // 041-060
  ...Array.from({ length: 20 }, () => '남은 경품이 「{series}」 구성으로 바뀌었어요. 이미 얻은 경품은 그대로예요'),
  // 061-080
  ...Array.from({ length: 20 }, () => '「{series}」 경품에 같은 색 테두리와 기호가 붙었어요. 구성은 그대로예요'),
  // 081-100
  '다음 샷이 평범한 샷으로 돌아와요', '다음 샷이 평소대로 돌아와요',
  '다음 샷의 코르크가 조금 두꺼워져요', '다음 샷의 코르크가 조금 얇아져요',
  '다음 샷은 가까운 두 방향으로 갈라져요', '다음 샷은 세 방향으로 갈라져요',
  '다음 샷은 더 깎지만 덜 밀어요', '다음 샷은 더 밀지만 덜 깎아요',
  '다음 샷은 빠르지만 덜 밀어요',
  '경품 하나가 다른 경품의 종류로 바뀌었어요',
  '경품 하나가 처음 놓였던 종류로 돌아갔어요',
  '경품 하나가 마지막으로 얻은 종류로 바뀌었어요',
  '다음 샷에서 경품의 내구도가 표시돼요',
  '다음 샷에서 한 종류만 더 있으면 되는 세트에 힌트가 나타나요',
  '다음 샷에서 이번 판에 아직 얻지 못한 경품에 표시가 붙어요',
  '다음 샷에서 같은 종류의 경품에 이름과 개수가 표시돼요',
  '다음 샷에서 움직이는 경품의 움직임 주기가 표시돼요',
  '다음 샷에서 첫 타격 지점의 표시가 나타나요. 어디까지나 참고용이라 달라질 수 있어요',
  '이후 다음 샷의 비행 경로가 더 잘 보여요',
  '다음 샷에서 조준에 각도 눈금이 나타나요',
];

const seriesLabels: Record<string, string> = {
  SER01: '과자 가게', SER02: '티파티', SER03: '여름 축제', SER04: '옛날 놀이', SER05: '친숙한 동물',
  SER06: '동물원', SER07: '숲 풍경', SER08: '바다 생물', SER09: '여행 탈것', SER10: '일하는 차량',
  SER11: '나들이 도구', SER12: '우주 탐사', SER13: '하늘 풍경', SER14: '꽃 정원', SER15: '작은 벌레',
  SER16: '콘서트', SER17: '모두의 놀이', SER18: '아침 식사와 도시락', SER19: '간식 가게', SER20: '소꿉 부엌',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[과자]', SER02: '[차]', SER03: '[축제]', SER04: '[옛날]', SER05: '[반려]',
  SER06: '[동물원]', SER07: '[숲]', SER08: '[바다]', SER09: '[여행]', SER10: '[공사]',
  SER11: '[나들이]', SER12: '[우주]', SER13: '[하늘]', SER14: '[꽃]', SER15: '[벌레]',
  SER16: '[음악]', SER17: '[놀이]', SER18: '[식사]', SER19: '[간식]', SER20: '[부엌]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const KO_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: '코르크를 늘리거나 샷을 바꿔요',
    RISK: '순풍일지 역풍일지, 운에 맡겨요',
    STOCK: '경품 시리즈를 바꿔요',
    GUIDE: '한 시리즈의 경품을 찾아요',
    MIX: '여러 가지 요령과 안내',
    CHAOS: '뭐든 나올 수 있어요, 운명에 맡겨요',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: '지금은 쓸 수 있는 효과가 없어요',
    effectNotApplicable: '이번에는 이 효과를 쓸 수 없었어요',
    noOutlineTarget: '지금은 대상 경품이 없어요',
    sideEffectTemporaryOutsideSeries: '경품이 일시적으로 시리즈 밖에 놓일 수 있어요',
  },
};
