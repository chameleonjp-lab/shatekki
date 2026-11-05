# 受入確認の証拠（Task 17）

AC01〜45の実際の試験結果を記録する。「証拠の種類」は、単体・統合（Node上の自動試験）、ブラウザ自動（ChromiumでiPhone程度の画面幅をまねたもの）、実機（iPhone Safariでの観察）、本番（公開URL・正式ランキング）を区別する。証拠がないものは合格にしない。

最終更新：2026-11-05 Opus（P1統合、コミット9154f0f以降）。「自動試験で確認」はNode上またはChromiumでの結果で、iPhone Safari実機の結果ではない。

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
| AC09 | 06,09 | unit/prizes.test.ts; unit/scoring.test.ts | 単体（物理） | 一部確認（分裂弾はTask 08） | unit/prizes property「each instance is collected once」、core/settlementの重複排除 |
| AC10 | 06 | unit/replenish.test.ts | 単体 | 自動試験で確認 | unit/replenish「does not refill during flight」 |
| AC11 | 06 | unit/replenish.test.ts | 単体 | 自動試験で確認 | unit/replenish（新個体・満タン、塞がり延期、未獲得を消さない、9個以下） |
| AC12 | 03 | unit/draw.test.ts | 単体 | 自動試験で確認 | unit/draw（固定seed、重み>0、再出現可、連続抑制、難易度の偏り調整） |
| AC13 | 06 | unit/motion.test.ts | 単体（物理） | 自動試験で確認 | unit/motion「after 60 s of idle time nothing is collected」ほか |
| AC14 | 05 | unit/collision.test.ts | 単体（物理） | 自動試験で確認 | unit/collision「off-screen contact is still simulated」、同じ入力で同じ記録 |
| AC15 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC16 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC17 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC18 | 04,08,09 | unit/shot-flow.test.ts; unit/scoring.test.ts | — | 未実施 | — |
| AC19 | 05,08 | unit/collision.test.ts; unit/gimmicks.test.ts | 単体（物理） | 一部確認（落下猶予はTask 08） | unit/collision「every shot ends in finite simulation time」、unit/motion「settle never waits」 |
| AC20 | 09 | unit/scoring.test.ts | — | 未実施 | — |
| AC21 | 09 | unit/scoring.test.ts | — | 未実施 | — |
| AC22 | 09,10 | unit/scoring.test.ts; integration/checkpoint.test.ts | — | 未実施 | — |
| AC23 | 14 | integration/screens.test.ts | — | 未実施 | — |
| AC24 | 09 | unit/scoring.test.ts | — | 未実施 | — |
| AC25 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
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
| AC38 | 10 | integration/checkpoint.test.ts | — | 未実施 | — |
| AC39 | 10,16 | integration/checkpoint.test.ts; integration/ranking.test.ts | — | 未実施 | — |
| AC40 | 05,17 | e2e/performance.spec.ts | 単体（物理） | 一部確認（性能は未計測） | unit/collision「a very fast cork does not tunnel through a thin shelf board」 |
| AC41 | 16,18 | integration/security.test.ts | — | 未実施 | — |
| AC42 | 17 | e2e/acceptance.spec.ts | — | 未実施 | — |
| AC43 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC44 | 08,09 | unit/gimmicks.test.ts; unit/scoring.test.ts | — | 未実施 | — |
| AC45 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |

## 実施できない項目

iPhone実機とSafari（WebKit）の確認は、この実行環境では行えない。テスト用ページの外部公開も承認されていないため、実機が必要な項目（AC37の実機確認、AC40の実機性能など）は「実施不能（承認待ち）」として残す。本番URL・正式ランキングが必要な項目（AC29、AC31〜34、AC41の一部）はTask 18で公開後に確認する。
