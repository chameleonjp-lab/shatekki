# 受入確認の証拠（Task 17）

AC01〜45の実際の試験結果を記録する。「証拠の種類」は、単体・統合（Node上の自動試験）、ブラウザ自動（ChromiumでiPhone程度の画面幅をまねたもの）、実機（iPhone Safariでの観察）、本番（公開URL・正式ランキング）を区別する。証拠がないものは合格にしない。

最終更新：2026-11-05 Opus（P2統合後）。「自動試験で確認」はNode上またはChromiumでの結果で、iPhone Safari実機の結果ではない。

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
| AC22 | 09,10 | unit/scoring.test.ts; integration/checkpoint.test.ts | 統合 | 一部確認（図鑑画面はTask 14の統合待ち） | integration/checkpoint「a new run starts with no completed sets while the book keeps every discovery」 |
| AC23 | 14 | integration/screens.test.ts | — | 未実施 | — |
| AC24 | 09 | unit/scoring.test.ts | 単体＋統合 | 自動試験で確認 | unit/scoring「50 + 20 - 100 -> 0 (applied 70), then +30 -> 30」、integration/devices-run「penalty plate」 |
| AC25 | 08 | unit/gimmicks.test.ts | 単体 | 一部確認（反応の演出はTask 12） | unit/scoring「score once per run per part/target; reactions may repeat」 |
| AC26 | 12 | unit/effects.test.ts | — | 未実施 | — |
| AC27 | 12 | unit/effects.test.ts | — | 未実施 | — |
| AC28 | 14,16 | integration/screens.test.ts; integration/ranking.test.ts | — | 未実施 | — |
| AC29 | 14,16,18 | integration/screens.test.ts; integration/ranking.test.ts | — | 未実施 | — |
| AC30 | 14 | integration/screens.test.ts | — | 未実施 | — |
| AC31 | 16,18 | integration/ranking.test.ts | — | 未実施 | — |
| AC32 | 16,18 | integration/ranking.test.ts | — | 未実施 | — |
| AC33 | 16,18 | integration/ranking.test.ts | — | 未実施 | — |
| AC34 | 15,18 | unit/share.test.ts | — | 未実施 | — |
| AC35 | 15 | unit/i18n.test.ts; e2e/locales.spec.ts | — | 未実施 | — |
| AC36 | 13,17 | unit/audio.test.ts | — | 未実施 | — |
| AC37 | 10,17 | integration/checkpoint.test.ts; e2e/acceptance.spec.ts | ブラウザ自動＋単体 | 一部確認（実機未確認） | e2e/smoke（横向き案内・非表示の検知）、unit/controller（停止中は進まず再開で時間を飛ばさない） |
| AC38 | 10 | integration/checkpoint.test.ts | 統合＋ブラウザ自動 | 自動試験で確認（実機未確認） | integration/checkpoint「restores shelf, ammo, score, draw state and first-hit flags exactly」、e2e/reload「reload between shots resumes」 |
| AC39 | 10,16 | integration/checkpoint.test.ts; integration/ranking.test.ts | 統合＋ブラウザ自動 | 一部確認（ランキング送信側はTask 16の統合待ち） | integration/checkpoint「flight, transform and fall all leave the FIRE marker」、e2e/reload「reload while the shot is resolving abandons」 |
| AC40 | 05,17 | e2e/performance.spec.ts | 単体（物理） | 一部確認（性能は未計測） | unit/collision「a very fast cork does not tunnel through a thin shelf board」 |
| AC41 | 16,18 | integration/security.test.ts | — | 未実施 | — |
| AC42 | 17 | e2e/acceptance.spec.ts | 単体 | 一部確認（演出省略・画面を含む通しはTask 17） | unit/scoring・settlement（最後の一発→分裂→追加弾→獲得→複数セット） |
| AC43 | 08 | unit/gimmicks.test.ts | 単体（物理） | 自動試験で確認 | unit/devices-sim「AC43: original + split corks hitting the same plate again give one activation」 |
| AC44 | 08,09 | unit/gimmicks.test.ts; unit/scoring.test.ts | 単体（物理）＋統合 | 自動試験で確認 | unit/transform-grace「HP 2/8 -> max 20 -> 5; the transformed prize falling in the same shot counts」、integration/devices-run「transform plate」 |
| AC45 | 08 | unit/gimmicks.test.ts | 単体（物理） | 自動試験で確認（猶予秒数は試作） | unit/transform-grace「a prize already falling when the limit is hit is still collected within the grace」「never re-extended」 |

## 実施できない項目

iPhone実機とSafari（WebKit）の確認は、この実行環境では行えない。テスト用ページの外部公開も承認されていないため、実機が必要な項目（AC37の実機確認、AC40の実機性能など）は「実施不能（承認待ち）」として残す。本番URL・正式ランキングが必要な項目（AC29、AC31〜34、AC41の一部）はTask 18で公開後に確認する。
