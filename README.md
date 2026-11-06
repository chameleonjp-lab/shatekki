# shatekki — 屋台の射的ゲーム

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

変更は専用ブランチからmainへのPRで提出し、マージは利用者が行います。現在のGitHub Actionsは試験のみを行います。マージしても本番公開やデータベース登録は行いません。

## 自動確認と公開準備

[変更範囲ごとの自動確認](docs/qa/ci-scope.md)で、文書だけの変更・機能ごとの試験・全試験を分けます。Node試験とビルドを並行し、画面試験を2分割して同じビルド結果を使います。必要な試験が省略された場合や実行件数が0件だった場合は成功にしません。

[iPhone確認用ページの公開準備](docs/release/preview-ready.md)と[本人順位の追加設計案](docs/release/ranking-identity-plan.md)も用意しています。公開用設定は実行されないテンプレートで、まだ外部へ公開していません。

## 開発の確認

変更に応じて[確認範囲](docs/qa/ci-scope.md)を選びます。全体を確かめる場合は、Node 22以上で `npm ci`、`npm run check`（型検査・単体・統合・ビルド）、`npm run test:e2e`（Chromiumで画面操作）を実行します。iPhone程度の画面幅をまねる試験はSafari実機の確認とは別です。

[実装の基準](docs/architecture/implementation-baseline.md)・[一射の処理設計](docs/architecture/shot-pipeline.md)・[公開前の確認と承認事項](docs/release/approval-request.md)も保存しています。
