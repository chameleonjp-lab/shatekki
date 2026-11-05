/**
 * Japanese strings for the minimal controls. Keys are stable so Task 15 can
 * move them into src/i18n for all 15 languages. Logic must never branch on
 * the displayed text.
 */
export const JA_CONTROLS: Readonly<Record<string, string>> = {
  'hint.position': '左右で立ち位置を選び、「ここで構える」を押してください',
  'hint.loading': 'バーが光る所で「込める」を押してください',
  'hint.aiming': '下の枠をなぞって狙い、「撃つ」を押してください',
  'hint.resolving': 'コルクの行方を見守っています…',
  'hint.paused': '一時停止中です',
  'hint.ended': '弾がなくなりました',
  'hint.abandoned': '撃っている途中で中断されたため、このプレイは記録されません',
  'btn.left': '◀',
  'btn.right': '▶',
  'btn.confirmPosition': 'ここで構える',
  'btn.load': '込める',
  'btn.fire': '撃つ',
  'btn.skip': '演出をとばす',
  'btn.resume': '再開する',
  'btn.pause': '一時停止',
  'btn.retry': 'もう一回',
  'hud.ammo': '弾',
  'hud.bonus': '追加',
  'hud.score': '点',
  'load.perfect': '会心の装填',
  'load.good': 'よい装填',
  'load.normal': 'ふつうの装填',
  'load.weak': '弱い装填',
  'aria.aimPad': '狙いを動かす操作枠',
  'aria.leftPos': '立ち位置を左へ',
  'aria.rightPos': '立ち位置を右へ',
  'rotate': '縦向きに戻してください',
  'prototype': '試作の数値で動いています（正式ランキング対象外）',
};

export function t(key: string): string {
  return JA_CONTROLS[key] ?? key;
}
