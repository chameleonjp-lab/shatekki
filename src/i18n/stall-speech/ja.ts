/**
 * r007 (aim first, stall, shopkeeper) player-facing text — Japanese source.
 * Spoken lines K001-K100: docs/design/2026-11-19-shopkeeper-lines.md (wording unchanged).
 * UI words: written for this candidate. Numbers and conditions never live in the text.
 */
export const AF_UI_JA = {
  'af.shoot': '撃つ',
  'af.fire': '発射',
  'af.cancel': '照準に戻る',
  'af.hint.aiming': '◀▶で動き、下の枠をなぞって狙ったら「撃つ」',
  'af.hint.loading': 'バーを見て、もう一度押したところで発射',
  'af.hint.saving': '保存しています…',
  'af.gauge.label': '強さ',
  'af.gauge.width': '判定幅 ×{m}',
  'af.tier.perfect': '会心',
  'af.tier.good': 'よい',
  'af.tier.normal': 'ふつう',
  'af.tier.weak': '弱い',
  'af.aria.left': '左へ動く（押し続けると連続で動く）',
  'af.aria.right': '右へ動く（押し続けると連続で動く）',
  'af.aria.gauge': '強さを選ぶバー',
  'af.next.mark': '次の1射',
  'af.talk.open': '店主と話す',
  'af.talk.title': '店主と話す',
  'af.talk.lead': '話せるのは1ゲームに1回。選ぶまでは使ったことになりません。',
  'af.talk.hint': '組み合わせのヒント',
  'af.talk.hint.note': '2景品の組を一つ教えてもらう。陳列と残弾は変わらない。',
  'af.talk.ammo': '弾を1発もらう',
  'af.talk.ammo.note': 'いま弾＋{n}。その代わり、次に発射する1射は威力の判定幅が狭くなる（×{m}）。',
  'af.talk.ammo.cap': '追加できる弾が上限に達しているため選べません。',
  'af.talk.ammo.reserved': '次の1射の判定幅がすでに変わっているため選べません。',
  'af.talk.close': '閉じる',
  'af.talk.blocked.used': 'この回はもう話しました',
  'af.talk.blocked.notAiming': '狙っている間に話せます',
  'af.talk.blocked.noAmmo': '弾がないと話せません',
  'af.talk.blocked.paused': '一時停止中です',
  'af.talk.blocked.orderOpen': '先に注文札に答えてください',
  'af.talk.result.ammo': '弾 ＋{n}（いま {ammo} 発）。次の1射は判定幅 ×{m}',
  'af.talk.result.ammoShort': '弾 ＋{n}。その次の1射は判定幅 ×{m}',
  'af.talk.result.hint': '「{set}」：あと {names}',
  'af.talk.result.noHint': '図鑑で、取った景品と組になる相手を確認できます',
  'af.talk.used': '店主と話した：{text}',
  'af.speaker': '店主',
  'af.part.hat': '帽子',
  'af.part.fan': 'うちわ',
  'af.part.body': '胴',
  'af.part.feet': '足元',
  'af.part.points': '{part} ＋{p}点',
  'af.part.again': '{part}に命中（点と効果は初回のみ）',
  'af.part.hat.ammo': '補給 ＋{n}発',
  'af.part.hat.cap': '補給は上限',
  'af.part.feet.zone': '次の1射は判定幅 ×{m}',
  'af.part.feet.lost': '判定幅の変化は次へ残りませんでした',
  'af.part.body.hint': '組のヒント「{set}」：あと {names}',
  'af.part.body.none': '図鑑で、取った景品と組になる相手を確認できます',
  'af.fact.prize': '「{name}」を押しました',
  'af.fact.usedCell': '使ったマスで反射しました',
  'af.fact.usedCell.near': '使ったマスで反射。隣の「？」にも効果があります',
  'af.fact.device': '仕掛けに当たりました（この射ではもう作動済み）',
  'af.fact.tray': '盆で跳ね返りました',
  'af.fact.surface': '屋台の木や布に当たって跳ね返りました',
  'af.fact.hidden': '隠れた的に当たりました',
  'af.fact.shopkeeper': '{part}に当たりました',
  'af.miss.left': '左へ抜けました。棚の中央寄りを狙ってみよう',
  'af.miss.right': '右へ抜けました。棚の中央寄りを狙ってみよう',
  'af.miss.up': '上へ抜けました。少し下を狙ってみよう',
  'af.miss.down': '下へ抜けました。少し上を狙ってみよう',
  'af.miss.back': '奥へ抜けました。屋台の内側を狙ってみよう',
  'af.miss.front': '手前へ抜けました。手前の輪郭が見える景品から狙ってみよう',
  'af.miss.time': '届く前に時間切れ。近い景品から狙ってみよう',
  'af.miss.unknown': '狙いか立ち位置を見直してみよう',
  'af.shot.won': '「{name}」を獲得',
  'af.shot.wonMany': '{n}個まとめて獲得',
  'af.shot.continue': '最後の一発から続行！ 残り {n} 発',
  'af.shot.points': '＋{p}点',
  'af.set.ribbon': 'セット完成',
  'af.set.many': '{n}組完成',
  'af.set.first': '初発見',
  'af.set.total': '合計 {score}点',
  'af.set.points': '＋{p}点',
  'af.ammo.gained': '弾 ＋{n}（実際に増えた数）',
  'af.ammo.lost': '弾 −{n}',
  'af.ammo.capped': '補給は上限のため ＋0',
  'af.ammo.left': '残り {n} 発',
  'af.result.talk': '店主との会話',
  'af.result.parts': '店主に当てた結果',
  'af.howto.1': '◀▶で左右へ動きます。押し続けると続けて動きます。',
  'af.howto.2': '下の枠をなぞって狙います。照準は揺れません。',
  'af.howto.3': '「撃つ」で威力のゲージが出ます。同じボタンの「発射」で1発撃ちます。',
  'af.howto.4': '景品を下の回収位置まで落とすと獲得です。弾は最初に10発、補給で累計10発まで増やせます。',
  'af.howto.5': '2種類または3種類の景品をそろえるとセットが成立します。図鑑でヒントを見られます。',
  'af.map.left': '左壁',
  'af.map.edge': '外周',
  'af.map.right': '右壁',
  'exp.fx.FX012.r007.name': '威力を合わせやすい',
  'exp.fx.FX013.r007.name': '威力をさらに合わせやすい',
  'exp.fx.FX035.r007.name': '威力をやや合わせにくい',
  'exp.fx.FX036.r007.name': '威力を合わせにくい',
  'exp.fx.FX012.r007.result': '次の1射は威力の判定幅が1.25倍になります',
  'exp.fx.FX013.r007.result': '次の1射は威力の判定幅が1.5倍になります',
  'exp.fx.FX035.r007.result': '次の1射は威力の判定幅が0.85倍になります',
  'exp.fx.FX036.r007.result': '次の1射は威力の判定幅が0.7倍になります',
} as const;

export type AfUiKey = keyof typeof AF_UI_JA;

/** When a spoken line may be drawn (the doc's 条件 column). 'always' = 共通. */
export type SpeechCondition =
  | 'always'
  | 'bagOnShelf'
  | 'chimeUnused'
  | 'piggyUnused'
  | 'piggyOneLeft'
  | 'seesawUnused'
  | 'shopkeeperVisible'
  | 'noShotYet'
  | 'noPrizeAfterShots'
  | 'lastHitNoPrize'
  | 'lastNoContact'
  | 'bonusRoom'
  | 'bonusFull'
  | 'targetRoom3'
  | 'targetRoom1'
  | 'lastCork'
  | 'orderActive'
  | 'orderDone'
  | 'wonAny'
  | 'setThisRun'
  | 'daily'
  | 'normalRecorded'
  | 'refilledThisRun';

export type SpeechCategory = 'welcome' | 'controls' | 'prizes' | 'stall' | 'situation';

export interface SpeechLineDef {
  readonly id: string;
  readonly category: SpeechCategory;
  readonly when: SpeechCondition;
}

const C = (id: number, when: SpeechCondition = 'always'): SpeechLineDef => ({
  id: `K${String(id).padStart(3, '0')}`,
  category: id <= 20 ? 'welcome' : id <= 40 ? 'controls' : id <= 60 ? 'prizes' : id <= 80 ? 'stall' : 'situation',
  when,
});

/** The 100 lines, K001..K100, with the condition of the design doc. */
export const SPEECH_LINES: readonly SpeechLineDef[] = [
  ...Array.from({ length: 70 }, (_, i) => C(i + 1)),
  C(71, 'bagOnShelf'), C(72, 'chimeUnused'), C(73, 'piggyUnused'), C(74, 'piggyOneLeft'), C(75, 'seesawUnused'), C(76, 'shopkeeperVisible'),
  C(77), C(78), C(79), C(80),
  C(81, 'noShotYet'), C(82, 'noShotYet'), C(83, 'noShotYet'), C(84, 'noShotYet'),
  C(85, 'noPrizeAfterShots'), C(86, 'noPrizeAfterShots'), C(87, 'lastHitNoPrize'), C(88, 'lastNoContact'),
  C(89, 'bonusRoom'), C(90, 'bonusFull'), C(91, 'targetRoom3'), C(92, 'targetRoom1'), C(93, 'lastCork'),
  C(94, 'orderActive'), C(95, 'orderDone'), C(96, 'wonAny'), C(97, 'setThisRun'), C(98, 'daily'), C(99, 'normalRecorded'), C(100, 'refilledThisRun'),
];

export const SPEECH_JA: Readonly<Record<string, string>> = {
  K001: 'いらっしゃい。気になる景品があれば、のぞいてって。',
  K002: '棚いっぱいに並べたよ。どれから見ようか。',
  K003: '日が落ちると、提灯の赤がきれいだねえ。',
  K004: '箱のお菓子も、丸いおもちゃもあるよ。',
  K005: '祭りのおみやげ、ここで探していかないかい。',
  K006: '急ぐことはないよ。ゆっくり選んで。',
  K007: '向こうから太鼓の音が聞こえてくるね。',
  K008: 'この棚は、右から見るのと左から見るのとで違って見えるよ。',
  K009: 'ひときわ明るいのは、屋台の端の提灯さ。',
  K010: 'この前掛けを締めると、祭りが始まった気がするんだ。',
  K011: '小さくても、気になる景品はあるもんだ。',
  K012: 'うちわの風が、ちょうどいい夕方だねえ。',
  K013: 'さて、お客さんはどんな景品がお好みかな。',
  K014: '下の段から見ると、意外なものが見つかるよ。',
  K015: 'ここだけはまだ明るいよ。気の済むまで見てって。',
  K016: 'その目は、もう景品を決めた目だねえ。',
  K017: '迷ったら、持ち帰りたいものから選ぶのもいい。',
  K018: '木の棚を見ると、昔の縁日を思い出すよ。',
  K019: 'ようこそ。見ているだけでも歓迎だよ。',
  K020: '屋台の裏まで灯りが回るようにしてあるよ。',
  K021: '左右のボタンで、見やすいところへ動けるよ。',
  K022: '横のボタンは押し続けても動けるんだ。',
  K023: 'ちょっと横に立つだけで、景品のすき間が見えるよ。',
  K024: '下の照準枠をなぞると、狙いを動かせるよ。',
  K025: '手前の景品に隠れていたら、横からのぞいてごらん。',
  K026: '先に狙いを合わせてから「撃つ」だよ。',
  K027: '「撃つ」を押すと、強さを選ぶバーが出るよ。',
  K028: 'バーを見て、もう一度押したところで発射だ。',
  K029: '強い区画の真ん中を目安に止めてごらん。',
  K030: '弱いところで止めても、弾は飛ぶよ。',
  K031: 'もう一度狙いたいときは「照準に戻る」だよ。',
  K032: '取り消しただけなら弾は減らないよ。',
  K033: '同じ場所をもう一度狙うなら、位置はそのままでいいよ。',
  K034: '動く景品には、目の前を通るところで合わせてみよう。',
  K035: '狙いを決める間、照準が勝手に揺れることはないよ。',
  K036: '強さを選ぶ間は、決めた狙いのままだ。',
  K037: 'バーは折り返すよ。次に戻ってくるところを待てる。',
  K038: '台の端まできたら、反対側のボタンへどうぞ。',
  K039: '少し上を見ただけで、棚の奥がのぞけることもあるよ。',
  K040: '指を離してから発射ボタンへ。落ち着いてどうぞ。',
  K041: '箱が横にずれたら、次は端へ押すつもりで。',
  K042: '景品は回収できるところまで落とすと手に入るよ。',
  K043: '上の段から落ちた景品が、下の段を押すこともあるよ。',
  K044: '同じ景品でも、どこを押すかで落ち方が変わるよ。',
  K045: '丸いものは、転がりだす方向にも注目だ。',
  K046: '棚に残った景品は、次も狙えるよ。',
  K047: '動く景品を追うなら、まず一往復見てみようか。',
  K048: '一射でいくつも落ちることがあるよ。',
  K049: '景品がふたつでそろう組と、みっつでそろう組があるよ。',
  K050: 'セットの景品は、別々の射で取ってもそろうよ。',
  K051: '同じ品を何個取っても、セットには違う種類が要るよ。',
  K052: '取った景品が、いくつかの組に使えることもあるよ。',
  K053: '前に発見した組も、この回でそろえば点が入るよ。',
  K054: '図鑑には、まだ見つけていない組のヒントもあるよ。',
  K055: '名前が見つかった組は、どんな景品が必要か見直せるよ。',
  K056: '組がそろったら、札の名前と点を見ておくれ。',
  K057: '一度取った景品は、その回の組づくりに使えるよ。',
  K058: '似た景品でも、それぞれ狙いやすいところが違うよ。',
  K059: '棚が空いたら、一射が終わってから次の景品を出すよ。',
  K060: '当たって落ちないときは、立つ場所も変えてみよう。',
  K061: '景品の奥の「？」も、コルクで狙えるよ。',
  K062: '棚の横の壁にもマスが並んでいるよ。',
  K063: 'ひとつのマスが働くのは、遊んでいる間に一度だよ。',
  K064: '「✓」のマスでも弾は跳ね返るよ。',
  K065: 'マスに景品が触れても、コルクの命中には数えないよ。',
  K066: '付いた効果は、一射の結果の欄で確かめられるよ。',
  K067: '壁へ当ててから、景品へ向かう弾もあるよ。',
  K068: '色がそろった縁は、同じシリーズを見る目印だよ。',
  K069: '景品の品替えが起きたら、変わった場所の札を見てごらん。',
  K070: '次の一射に効くものは、弾の表示のそばに印が出るよ。',
  K071: '小袋が付いている景品、見つけられるかな。',
  K072: '風鈴は壁や棚板で跳ねた弾で狙ってみよう。',
  K073: '貯金箱を狙うなら、胴じゃなくて投入口だよ。',
  K074: '貯金箱はあと一射分。その一射の弾は一度だけ数えるよ。',
  K075: '下の受け皿へ景品が落ちるよう、押す方向を考えてみよう。',
  K076: 'うちわのほうまで届けば、ひとつ聞くことがあるかもね。',
  K077: '分かれたコルクも、元の一射の結果に入るよ。',
  K078: '左・真ん中・右に、景品を取れる区画があるよ。',
  K079: '使用済みか迷ったら、マスの角の印を見ておくれ。',
  K080: '棚のすき間から、もうひとつ奥を狙う手もあるよ。',
  K081: '最初の一射、どの段にしてみようか。',
  K082: 'まずはひとつ、好きな景品を決めてみよう。',
  K083: 'ど真ん中からでも、端へ回ってからでもどうぞ。',
  K084: '奥のマスを狙うなら、手前の景品も見ておこう。',
  K085: '立ち位置をずらすと、別の面を押せるかもね。',
  K086: '下の段に狙いを替えてみる手もあるよ。',
  K087: 'さっき当たった景品、端からもうひと押しもいいね。',
  K088: '手前に輪郭が見える景品から狙い直してみよう。',
  K089: '弾の補給も狙いどころ。追加できる数には上限があるよ。',
  K090: '追加の弾は上限だ。いま持っている弾でどうぞ。',
  K091: '二重丸は、中心が当たれば弾が3発だよ。',
  K092: '大きい輪のほうを狙って、まず一発を取り戻す手もあるよ。',
  K093: 'あと一発。景品の端か、奥のマスか、決めるのはお客さん。',
  K094: '引き受けた注文は、残り何射かを札で見てね。',
  K095: '注文の品、棚からうまく取ってくれたね。',
  K096: '取った品を見ながら、次の組を考えてみよう。',
  K097: '今回のセットを手がかりに、別の組も狙ってみよう。',
  K098: '今日の棚なら、同じ日にまた同じ並びで始められるよ。',
  K099: '気に入った景品は、終わってからおみやげ棚へ飾れるよ。',
  K100: 'この回で弾を補給したね。残りも好きなところへどうぞ。',
};
