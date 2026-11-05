# shatekki — 屋台の射的ゲーム 要件資料

2026年11月6日作成・更新。ゲーム本体ではなく、確定したルールと残る調整項目をまとめた資料一式です。正式な公開タイトルは未確定です。

## 読む順番

1. [要件仕様書](docs/requirements.md)：ゲームの流れ、共通画面、射的固有の結果表示、保存・ランキング・音・多言語。
2. [決定記録](docs/decision-log.md)：ユーザーが採用した最初の26項目と、実装前に追加採用した7項目（27〜33、計33項目）。
3. [セット候補100件](docs/set-candidates.md)と[景品候補100種類](docs/prize-candidates.md)：原資料から引き継いだ候補。
4. [未確定事項](docs/open-items.md)と[受入確認項目](docs/acceptance-criteria.md)：残る詳細と実装後に確認する内容。

整理用の[JSONデータ](data/catalog-candidates.json)もあります。未定値はnullであり、0点や耐久値0の指定ではありません。

## Claude Codeで実装するための資料

- [Claude Code実装計画書（Opus 5.5 / Sonnet 5.5）](docs/superpowers/plans/2026-11-06-shatekki-claude-code.md)：工程・担当・テスト・PR条件。
- [Claude Code開始指示文](docs/claude-code-start-prompt.md)：Opusへ貼り付ける最初の依頼。
- [ChatGPTとClaudeの申し送り規約](docs/handoff/protocol.md)：相手宛のIssue・PR・メモの書式と責任範囲。
- [CLAUDE.md](CLAUDE.md)：Claude Codeが最初に読むリポジトリ共通指示。

相手向けの別リポジトリはまだ指定されていないため、申し送りは一時的に本リポジトリの docs/handoff/to-claude/ と docs/handoff/to-chatgpt/ を使う計画です。別リポジトリの追加や外部公開は今回行いません。

## 確定した骨格

景品100種類、セット100種類、縦向きメイン、軽量3D、棚9個、初期10発＋追加累計10発。一射が終わってから空き場所を補充し、最後の連鎖を処理した後に弾切れなら終了します。追加決定では、一射中の再読み込みを中断扱いにすること、得点下限0の適用、最大連鎖、補充の延期、特殊装置の発動制限、景品変化、落下判定の短い猶予を確定しました。ホームと結果の共通機能は他ゲームの共通要件を引き継ぎ、獲得景品やセットなどの結果表現は本ゲーム専用にします。

## 保存履歴と作業範囲

2026年11月6日、ユーザーの個別許可でREADMEだけのmain初期コミットを作成し、要件資料を[PR #3](https://github.com/chameleonjp-lab/shatekki/pull/3)で追加・マージしました。元の保存記録は[Issue #2](https://github.com/chameleonjp-lab/shatekki/issues/2)です。

追加7項目（27〜33）は[PR #4](https://github.com/chameleonjp-lab/shatekki/pull/4)で追加され、マージ済みです。今回のClaude Code計画書・申し送り資料は新しいブランチからPRで提出します。ゲーム実装、本番公開、データベースやランキングの変更は含めません。mainへの直接変更は行いません。

元の要件アイデアリスト第3版には古い検討案も残っているため、この資料は確定事項と候補を明確に分離しています。原資料そのものの上書きは行っていません。
