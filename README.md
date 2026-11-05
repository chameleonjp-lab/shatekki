# shatekki — 屋台の射的ゲーム 要件・実装計画

2026年11月6日更新。確定したルールと実装計画の資料一式です。ゲーム本体はまだ実装していません。正式な公開タイトルは未確定です。

## 読む順番

1. [要件仕様書](docs/requirements.md)と[決定記録](docs/decision-log.md)：01〜33の確定内容。
2. [受入確認45項目](docs/acceptance-criteria.md)と[未確定事項](docs/open-items.md)：未実施の確認と残る詳細。
3. [景品100種類](docs/prize-candidates.md)、[セット100組](docs/set-candidates.md)、[候補JSON](data/catalog-candidates.json)：具体的な名称・組合せの候補。nullは0点/HP0ではありません。
4. [Claude Code実装計画1.1](docs/superpowers/plans/2026-11-06-shatekki-claude-code.md)：Opus 5.5/Sonnet 5.5の分担、19タスク、所有範囲と試験。

## 敵対的検証で更新した資料

[検証報告](docs/reviews/2026-11-06-plan-adversarial-review.md)に15件の問題・修正点を整理し、[要件と工程の対応表](docs/reviews/shatekki-plan-traceability.md)に33決定、45確認、残る13分類を対応付けました。これは計画の検査であり、ゲームの動作試験合格ではありません。

[CLAUDE.md](CLAUDE.md)、[Claude Code開始指示](docs/claude-code-start-prompt.md)、[申し送り規約](docs/handoff/protocol.md)、[Claude宛の今回の申し送り](docs/handoff/to-claude/2026-11-06-plan-review.md)も更新・追加しています。

Claudeは初期実装と美術・演出・音、ChatGPTは要件・仕様管理と不具合/想定外への修正を担当します。別の相手宛リポジトリは未指定のため、暫定窓口は同repoの `docs/handoff/to-claude/` と `docs/handoff/to-chatgpt/` です。メモの投稿と相手の受領を区別します。

## 変えていない基本仕様

景品100種類、セット100種類、縦向きメイン、軽量3D、初期棚9個、初期10発＋追加累計10発。一射終了後に補充し、最後の連鎖まで処理して弾切れなら終了します。塞がった枠の補充は延期します。ホーム/結果の共通機能は他ゲームの共通要件を引き継ぎ、景品やセットの見せ方は射的専用です。

## 保存履歴と作業範囲

[Issue #2](https://github.com/chameleonjp-lab/shatekki/issues/2)に初期資料を記録し、[PR #3](https://github.com/chameleonjp-lab/shatekki/pull/3)でファイル化、[PR #4](https://github.com/chameleonjp-lab/shatekki/pull/4)で27〜33を反映、[PR #5](https://github.com/chameleonjp-lab/shatekki/pull/5)でClaude向け計画を追加しました。いずれもマージ済みです。

今回の検証修正は新しいPRで提出します。mainを直接変更せず、マージは利用者が行います。ゲーム実装、Claudeチーム起動、追加課金、DB変更、本番公開・実験場への新規掲載は行いません。元の要件書・決定記録・確認項目・候補データの内容は維持しています。
