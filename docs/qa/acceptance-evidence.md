# 受入確認の証拠（Task 17）

AC01〜45の実際の試験結果を記録する。「証拠の種類」は、単体・統合（Node上の自動試験）、ブラウザ自動（ChromiumでiPhone程度の画面幅をまねたもの）、実機（iPhone Safariでの観察）、本番（公開URL・正式ランキング）を区別する。証拠がないものは合格にしない。

最終更新：2026-11-06 ChatGPT（#11後の追加確認。元のTask 17記録は保持）。「自動試験で確認」はNode上またはChromiumでの結果で、iPhone Safari実機の結果ではない。

| AC | 担当Task | 試験（tests/配下） | 証拠の種類 | 状態 | 証拠（コミット・コマンド・件数） |
|---|---|---|---|---|---|
| AC01 | 06,07 | unit/prizes.test.ts; e2e/shot-smoke.spec.ts | ブラウザ自動＋単体 | 自動試験で確認（実機未確認） | e2e/shot-smoke「a new game shows 10 ammo and 9 prizes」(Chromium 2画面)、unit/shot-flow |
| AC02 | 03 | unit/catalog.test.ts | 単体 | 自動試験で確認 | unit/catalog（100景品・100セット・各3種の参照・重複なし） |
| AC03 | 07 | e2e/shot-smoke.spec.ts | ブラウザ自動＋単体 | 自動試験で確認（実機未確認） | e2e/shot-smoke「position → load → aim → fire」、unit/shot-flow |
| AC04 | 04,07 | unit/shot-flow.test.ts; e2e/shot-smoke.spec.ts | ブラウザ自動＋単体 | 自動試験で確認（実機未確認） | e2e/shot-smoke（二重タップ・装填の指残り）、unit/controller、unit/shot-flow |
| AC05 | 07 | unit/aim.test.ts | 単体 | 自動試験で確認 | unit/aim「load quality changes BOTH」、unit/shot-flow（装填後に位置を変えられない） |
| AC06 | 07 | unit/aim.test.ts | 単体＋統合 | 自動試験で確認（実機未確認） | unit/aim「fire direction equals visible effective aim」、integration/aim-parity（照準と最初の接触点の差5cm未満×5方向） |
| AC07 | 06 | unit/prizes.test.ts | 単体（物理） | 自動試験で確認 | unit/prizes「HP 0 alone is not a collection」「pushed off with HP left is collected」 |
| AC08 | 06 | unit/prizes.test.ts | 単体（物理） | 自動試験で確認 | unit/prizes「resting on a lower shelf board, or lying toppled」 |
| AC09 | 06,09 | unit/prizes.test.ts; unit/scoring.test.ts | 単体（物理）＋単体 | 自動試験で確認 | unit/prizes property、unit/scoring「a duplicate collection entry … add nothing」、分裂弾はunit/devices-sim |
| AC10 | 06 | unit/replenish.test.ts | 単体 | 自動試験で確認 | unit/replenish「does not refill during flight」 |
| AC11 | 06 | unit/replenish.test.ts | 単体 | 自動試験で確認 | unit/replenish（新個体・満タン、塞がり延期、未獲得を消さない、9個以下） |
| AC12 | 03 | unit/draw.test.ts | 単体 | 自動試験で確認 | unit/draw（固定seed、重み>0、再出現可、連続抑制、難易度の偏り調整） |
| AC13 | 06 | unit/motion.test.ts | 単体（物理） | 自動試験で確認 | unit/motion「after 60 s of idle time nothing is collected」ほか |
| AC14 | 05 | unit/collision.test.ts | 単体（物理） | 自動試験で確認 | unit/collision「off-screen contact is still simulated」、同じ入力で同じ記録 |
| AC15 | 08 | unit/gimmicks.test.ts | 単体＋統合 | 自動試験で確認 | unit/scoring「split never changes ammo」、integration/devices-run「split plate」、unit/devices-sim |
| AC16 | 08 | unit/gimmicks.test.ts | 単体（物理）＋統合 | 自動試験で確認（試作値） | unit/devices-sim「${kind}: one activation」6種、integration/devices-run 5種（仕掛けの効果量は試作 O08） |
| AC17 | 08 | unit/gimmicks.test.ts | 単体＋統合 | 自動試験で確認 | unit/gimmicks「cumulative 8 -> +2 -> 10 -> further +2 grants 0」、integration/devices-run「ammo plate」 |
| AC18 | 04,08,09 | unit/shot-flow.test.ts; unit/scoring.test.ts | 単体 | 自動試験で確認 | unit/scoring・settlement（追加弾を終了判定の前に付与。最後の一射の獲得・セットを反映） |
| AC19 | 05,08 | unit/collision.test.ts; unit/gimmicks.test.ts | 単体（物理） | 自動試験で確認 | unit/transform-grace「total time never exceeds maxFlight + maxSettle + grace」、unit/collision、unit/motion |
| AC20 | 09 | unit/scoring.test.ts | 単体 | 自動試験で確認 | unit/scoring「completes across shots in any order」「three of the same kind never substitute」 |
| AC21 | 09 | unit/scoring.test.ts | 単体 | 自動試験で確認 | unit/scoring「one collected kind may complete several sets, and several sets in one shot each score once」 |
| AC22 | 09,10 | unit/scoring.test.ts; integration/checkpoint.test.ts | 統合＋ブラウザ自動 | 自動試験で確認（実機未確認） | integration/checkpoint（次のゲームで成立済みをリセット・図鑑は保持）、e2e/screens「set book … 100 sets」 |
| AC23 | 14 | integration/screens.test.ts | 統合＋ブラウザ自動 | 自動試験で確認（ヒントは試作O02） | integration/screens（setBookViewModel：未発見は名前を伏せヒント、発見後は3景品）、e2e/screens「names hidden until discovered」 |
| AC24 | 09 | unit/scoring.test.ts | 単体＋統合 | 自動試験で確認 | unit/scoring「50 + 20 - 100 -> 0 (applied 70), then +30 -> 30」、integration/devices-run「penalty plate」 |
| AC25 | 08 | unit/gimmicks.test.ts | 単体 | 自動試験で確認（反応演出の実機未確認） | unit/scoring（初回だけ加点）、unit/effects（部位の反応は毎回） |
| AC26 | 12 | unit/effects.test.ts | 単体 | 自動試験で確認（実機未確認） | unit/effects（全接触点の小反応・継続接触の重複なし）、unit/classify・offscreenIndicator（画面外の方向と対象） |
| AC27 | 12 | unit/effects.test.ts | 単体 | 自動試験で確認 | unit/effects「skip / no skip give identical state」（凍結したフレームとsummary）、unit/classify（確定後にだけ分類） |
| AC28 | 14,16 | integration/screens.test.ts; integration/ranking.test.ts | ブラウザ自動＋統合 | 一部確認（同名別人の統合なしは本番DB側の課題） | e2e/screens「name is fixed at start; empty means anonymous」、integration/ranking（匿名は送信しない） |
| AC29 | 14,16,18 | integration/screens.test.ts; integration/ranking.test.ts | ブラウザ自動 | 一部確認（正式な詳細URLが未確定のため「準備中」） | e2e/screens「ranking is 準備中」。正式URLはTask 18（承認後） |
| AC30 | 14 | integration/screens.test.ts | ブラウザ自動＋統合 | 自動試験で確認（実機未確認） | e2e/screens「a whole run of 10 shots ends on the result screen」（総得点・もう一回が最初の画面内）、integration/screens（内訳・最大連鎖） |
| AC31 | 16,18 | integration/ranking.test.ts | 統合（模擬通信） | 一部確認（本番未接続） | integration/ranking（rank_noをそのまま使用、自己ベスト基準）。本番の集計はTask 18 |
| AC32 | 16,18 | integration/ranking.test.ts | 統合（模擬通信） | 一部確認（本番未接続） | integration/ranking（上位30参加者の取得）。実験場との一致はTask 18 |
| AC33 | 16,18 | integration/ranking.test.ts | 統合（模擬通信） | 一部確認（本番未接続） | integration/ranking（応答喪失後の再送で1件、古い応答で上書きしない、各状態） |
| AC34 | 15,18 | unit/share.test.ts | 単体＋ブラウザ自動 | 一部確認（正式URL未確定のため本文にURLなし） | unit/share（黒地白字・URLSearchParams・自動投稿なし・コピー代替）、e2e/screens「X share opens a post screen only」 |
| AC35 | 15 | unit/i18n.test.ts; e2e/screens.spec.ts | 単体＋ブラウザ自動 | 自動試験で確認（翻訳はClaude作成・母語話者の確認なし O16） | unit/i18n・i18n-content（15言語×UI文言・景品100・セット100・ヒント100）、e2e/screens「switching to English」 |
| AC36 | 13,17 | unit/audio.test.ts | 単体 | 一部確認（実際の試聴なし） | unit/audio（初回オン・音量正、保存済みオフ/0を尊重、解除失敗、停止で滞留音を破棄、連打の抑制） |
| AC37 | 10,17 | integration/checkpoint.test.ts; integration/acceptance-composite.test.ts | ブラウザ自動＋単体 | 一部確認（実機未確認） | e2e/smoke（横向き案内・非表示の検知）、unit/controller（停止中は進まず時間を飛ばさない）、unit/audio（停止で音を破棄）。実機は docs/qa/iphone-checklist.md 8・9 |
| AC38 | 10 | integration/checkpoint.test.ts | 統合＋ブラウザ自動 | 自動試験で確認（実機未確認） | integration/checkpoint「restores shelf, ammo, score, draw state and first-hit flags exactly」、e2e/reload「reload between shots resumes」 |
| AC39 | 10,16 | integration/checkpoint.test.ts; integration/ranking.test.ts | 統合＋ブラウザ自動 | 自動試験で確認（実機未確認） | integration/checkpoint「flight, transform and fall all leave the FIRE marker」、integration/acceptance-composite（中断は送信対象外）、integration/ranking（abandonedは送信しない）、e2e/reload「reload while the shot is resolving abandons」 |
| AC40 | 05,17 | e2e/performance.spec.ts | 統合＋ブラウザ自動 | 一部確認（実機の性能は未計測） | integration/performance（最も重い一射3種：95%点0.6ms以下、上限時間内）、unit/collision（薄い棚をすり抜けない）、e2e/performance（ソフトウェアGPUで中央値33ms）。docs/qa/performance.md |
| AC41 | 16,18 | integration/security.test.ts | 統合 | 一部確認（本番の旧記録はTask 18） | integration/security（src/と配信物に秘密鍵・service_roleなし） |
| AC42 | 17 | integration/acceptance-composite.test.ts | 統合 | 自動試験で確認（実機未確認） | integration/acceptance-composite（最後の一発→分裂→+2→2個獲得→2セット同時→演出省略で同じ状態→次の一射中の再読み込みで中断・送信対象外） |
| AC43 | 08 | unit/gimmicks.test.ts | 単体（物理） | 自動試験で確認 | unit/devices-sim「AC43: original + split corks hitting the same plate again give one activation」 |
| AC44 | 08,09 | unit/gimmicks.test.ts; unit/scoring.test.ts | 単体（物理）＋統合 | 自動試験で確認 | unit/transform-grace「HP 2/8 -> max 20 -> 5; the transformed prize falling in the same shot counts」、integration/devices-run「transform plate」 |
| AC45 | 08 | unit/gimmicks.test.ts | 単体（物理） | 自動試験で確認（猶予秒数は試作） | unit/transform-grace「a prize already falling when the limit is hit is still collected within the grace」「never re-extended」 |

## 実施できない項目

iPhone実機とSafari（WebKit）の確認は、この実行環境では行えない。テスト用ページの外部公開も承認されていないため、実機が必要な項目（AC37の実機確認、AC40の実機性能など）は「実施不能（承認待ち）」として残す。本番URL・正式ランキングが必要な項目（AC29、AC31〜34、AC41の一部）はTask 18で公開後に確認する。

## 集計（Task 17時点）

45項目のうち、自動試験で確認した項目が35、一部だけ確認した項目が10。どちらもiPhone Safari実機での確認はまだで、「合格」とは扱わない。一部確認の10項目は、本番のランキング・正式URLが必要なもの（AC28・29・31〜34・41）、実際の試聴が必要なもの（AC36）、実機が必要なもの（AC37・40）である。実機の手順は `docs/qa/iphone-checklist.md`、性能の記録は `docs/qa/performance.md`、つり合いの測定は `docs/qa/balance-probe.md`。

## #11後の追加確認（今回の修正ブランチ）

対象：main `9ea0a63` を基にした `fix/post-merge-followups`。詳細は[後続対応表](../release/follow-up-status.md)。

- AC28・31：名前＋点が上位30名に1件だけあっても本人とは確定できないため、本人順位の推測と本人行の強調を撤去。サーバー側の本人識別は未解決。模擬通信・結果表示の試験で確認。
- AC33・39・41：未登録設定での再送を止め、別ゲームの保存キューを再送・続行・終了・中断で変更しないことを確認。試作・提案値では開始も送信しない。公開キーはapikeyヘッダーのみ。実際の本番通信は未実施。
- AC35：途中再開、前回の中断、保存データ不読、起動中、複数タブ、起動エラーの10文言を15言語へ追加。単体試験で全言語のキー・空欄・変数一致を確認。英語の再開画面はブラウザ試験にも確認条件を追加。

ローカルのブラウザ試験は、指定版のダウンロード破損と、代替Chromium起動時の `socket() failed: Operation not permitted` により実行できなかった。56件はブラウザ起動前に失敗しており、ゲームの合格・不合格の証拠にはしない。PRの通常CIで再確認する。Safari実機・本番の状態はこの追記で合格へ変えない。
