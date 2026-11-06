# shatekki — 屋台の射的ゲーム

## 追加要件の修正書（2026年11月6日）

[要件修正書](docs/changes/2026-11-06-expanded-gameplay-requirements.md)に、2景品セット300種、店主の200質問と2択、縦3段×横12列の36枠、各背景マスで1ゲーム1回の100効果をまとめました。[セット300組](docs/changes/2026-11-06-pair-sets-300.md)・[質問200件](docs/changes/2026-11-06-shopkeeper-questions-200.md)・[シリーズと効果100件](docs/changes/2026-11-06-effects-100.md)の候補表も含みます。

**この追加要件は未実装です。** 既存の3景品セット100組を残す案、具体的な質問・効果・点数は修正書の提案として区別しています。下記の9枠・100セットは現行実装 rules-v1 の説明です。今回の文書PRで正式データやゲームの動作は変わりません。

[追加実装計画](docs/superpowers/plans/2026-11-06-expanded-gameplay.md)に、契約・データから36枠、質問と効果、保存、画面・15言語・音、統合確認までの10工程をまとめました。[44項目との対応表](docs/reviews/2026-11-06-expanded-gameplay-plan-traceability.md)と[計画レビュー](docs/reviews/2026-11-06-expanded-gameplay-plan-review.md)も参照できます。旧Task 00〜18を最初から実行し直す計画ではありません。

## 現行実装（rules-v1）

2026年11月6日更新。要件33項目に沿った試作を実装し、PR #7・#11・#13をmainへマージ済みです。**正式値を採用し、ランキング非公開・実験場未連携での公開を準備しています。公開URLとiPhone Safari実機の確認はまだです。** 正式名はシャテッキ／Shatekkiです。

[最新の残作業と今回の修正](docs/release/follow-up-status.md)に、実施済みの修正、確認結果、次の順序、利用者に判断いただく内容をまとめています。[タスク台帳](docs/architecture/task-ledger.md)と[受入確認の証拠](docs/qa/acceptance-evidence.md)も参照してください。

[初回正式公開の内容と適用状況](docs/release/official-v1.md)に、今回の承認範囲と非公開条件をまとめました。

## 仕様と実装

- [要件仕様書](docs/requirements.md)・[決定記録](docs/decision-log.md)：確定01〜33。
- [受入確認45項目](docs/acceptance-criteria.md)・[残る詳細](docs/open-items.md)：試作と正式採用、実機・本番の未確認を区別。
- [景品100種類](docs/prize-candidates.md)・[セット100組](docs/set-candidates.md)・[候補データ](data/catalog-candidates.json)：候補名・組合せ。nullは0点や耐久値0を意味しません。
- [実装計画1.1](docs/superpowers/plans/2026-11-06-shatekki-claude-code.md)・[対応表](docs/reviews/shatekki-plan-traceability.md)：Task 00〜18と各要件の対応。

景品100種類、セット100種類、縦向き中心、軽量3D、初期棚9個、初期10発＋追加累計10発。一射の処理後に空き枠を補充し、塞がった枠は延期します。最後の連鎖まで処理して弾切れなら終了します。今回の修正でゲームの点数・抽選・物理値は変えていません。

## 進め方

Claudeは初期実装と美術・演出・音、ChatGPTは要件管理と統合後の不具合修正を担当します。[CLAUDE.md](CLAUDE.md)・[申し送り規約](docs/handoff/protocol.md)に従い、今回の回答は[Claude宛の申し送り](docs/handoff/to-claude/2026-11-06-post-merge-followups.md)に記録しています。投稿と相手の受領は別に扱います。

変更は専用ブランチからmainへのPRで提出し、マージは利用者が行います。GitHub Actionsは変更範囲に応じた確認を行い、[Pagesの定義](.github/workflows/pages.yml)では最新mainの同じ成功CI実行にビルド成果物がある場合、それを配信へ渡します。文書だけの変更でビルドを省略した場合は再配信しません。データベース登録はこの仕組みに含みません。

## 自動確認と公開準備

[変更範囲ごとの自動確認](docs/qa/ci-scope.md)で、文書だけの変更・機能ごとの試験・全試験を分けます。Node試験とビルドを並行し、画面試験を2分割して同じビルド結果を使います。必要な試験が省略された場合や実行件数が0件だった場合は成功にしません。

[iPhone確認用ページの公開準備](docs/release/preview-ready.md)と[本人順位の追加設計案](docs/release/ranking-identity-plan.md)は準備時点の資料です。現行の公開条件は初回正式公開の記録を優先し、ランキング非公開・実験場未連携を維持します。配信する定義の存在と、公開URLへの到達・iPhone実機の確認完了は分けて扱います。

## 開発の確認

変更に応じて[確認範囲](docs/qa/ci-scope.md)を選びます。全体を確かめる場合は、Node 22以上で `npm ci`、`npm run check`（型検査・単体・統合・ビルド）、`npm run test:e2e`（Chromiumで画面操作）を実行します。iPhone程度の画面幅をまねる試験はSafari実機の確認とは別です。

[実装の基準](docs/architecture/implementation-baseline.md)・[一射の処理設計](docs/architecture/shot-pipeline.md)・[公開前の確認と承認事項](docs/release/approval-request.md)も保存しています。

