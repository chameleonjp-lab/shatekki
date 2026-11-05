# 受入確認の証拠（Task 17）

AC01〜45の実際の試験結果を記録する。「証拠の種類」は、単体・統合（Node上の自動試験）、ブラウザ自動（ChromiumでiPhone程度の画面幅をまねたもの）、実機（iPhone Safariでの観察）、本番（公開URL・正式ランキング）を区別する。証拠がないものは合格にしない。

最終更新：2026-11-05 Opus。現在、どの項目も合格の証拠はまだない。

| AC | 担当Task | 試験（tests/配下） | 証拠の種類 | 状態 | 証拠（コミット・コマンド・件数） |
|---|---|---|---|---|---|
| AC01 | 06,07 | unit/prizes.test.ts; e2e/shot-smoke.spec.ts | — | 未実施 | — |
| AC02 | 03 | unit/catalog.test.ts | — | 未実施 | — |
| AC03 | 07 | e2e/shot-smoke.spec.ts | — | 未実施 | — |
| AC04 | 04,07 | unit/shot-flow.test.ts; e2e/shot-smoke.spec.ts | — | 未実施 | — |
| AC05 | 07 | unit/aim.test.ts | — | 未実施 | — |
| AC06 | 07 | unit/aim.test.ts | — | 未実施 | — |
| AC07 | 06 | unit/prizes.test.ts | — | 未実施 | — |
| AC08 | 06 | unit/prizes.test.ts | — | 未実施 | — |
| AC09 | 06,09 | unit/prizes.test.ts; unit/scoring.test.ts | — | 未実施 | — |
| AC10 | 06 | unit/replenish.test.ts | — | 未実施 | — |
| AC11 | 06 | unit/replenish.test.ts | — | 未実施 | — |
| AC12 | 03 | unit/draw.test.ts | — | 未実施 | — |
| AC13 | 06 | unit/motion.test.ts | — | 未実施 | — |
| AC14 | 05 | unit/collision.test.ts | — | 未実施 | — |
| AC15 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC16 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC17 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC18 | 04,08,09 | unit/shot-flow.test.ts; unit/scoring.test.ts | — | 未実施 | — |
| AC19 | 05,08 | unit/collision.test.ts; unit/gimmicks.test.ts | — | 未実施 | — |
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
| AC37 | 10,17 | integration/checkpoint.test.ts; e2e/acceptance.spec.ts | — | 未実施 | — |
| AC38 | 10 | integration/checkpoint.test.ts | — | 未実施 | — |
| AC39 | 10,16 | integration/checkpoint.test.ts; integration/ranking.test.ts | — | 未実施 | — |
| AC40 | 05,17 | e2e/performance.spec.ts | — | 未実施 | — |
| AC41 | 16,18 | integration/security.test.ts | — | 未実施 | — |
| AC42 | 17 | e2e/acceptance.spec.ts | — | 未実施 | — |
| AC43 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |
| AC44 | 08,09 | unit/gimmicks.test.ts; unit/scoring.test.ts | — | 未実施 | — |
| AC45 | 08 | unit/gimmicks.test.ts | — | 未実施 | — |

## 実施できない項目

iPhone実機とSafari（WebKit）の確認は、この実行環境では行えない。テスト用ページの外部公開も承認されていないため、実機が必要な項目（AC37の実機確認、AC40の実機性能など）は「実施不能（承認待ち）」として残す。本番URL・正式ランキングが必要な項目（AC29、AC31〜34、AC41の一部）はTask 18で公開後に確認する。
