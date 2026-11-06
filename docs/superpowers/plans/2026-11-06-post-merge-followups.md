# マージ後の確認・修正計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** main `9ea0a63` を基準に、公開前に再現できる通信・本人表示の不具合を修正し、残作業と判断事項を最新にする。

**Architecture:** 既存の通信サービスの入口で送信条件を検査し、再送でも現在のゲーム設定を守る。本人を確認できない一覧から本人順位を推測しない。ゲームの採点・抽選・素材・正式値は変えない。

**Tech Stack:** TypeScript / Vitest / Playwright / Vite。

**Spec:** `docs/requirements.md` §8〜11、決定19・27、`docs/handoff/to-chatgpt/2026-11-06-0010-claude-prototype-values-and-set-odds.md`。

## Global Constraints

- main直push・自動マージ・外部公開・DB変更・新規課金はしない。専用ブランチからmain宛のPRにする。
- 33決定、100景品、100セット、試作の数値と保存済み記録を維持する。
- iPhone Safari実機と模擬通信の確認を区別する。

## Review Focus

- 未登録設定で保存済みの再送キューを開いても送信しない。
- 別ゲームのキューを現在のゲームとして送らず、削除もしない。
- 試作・提案中の値では開始記録も送らない。
- 上位30名に同じ名前・同じ点が1件あっても、本人とは確定できない。
- 公開キーを署名済みの認証トークンとして送らない。

## Task 1: 通信と本人表示の修正

**Files:** `src/ranking/client.ts`、`src/app.ts`、`src/ui/result.ts`、`tests/integration/ranking.test.ts`、`tests/integration/screens.test.ts`、`src/i18n/locales/*.ts`、`tests/unit/i18n.test.ts`、`tests/e2e/screens.spec.ts`。

**Interfaces:** `beginRun` に必須の `valueStatus: ValueStatus` を渡す。ランキングの既存応答には本人を示す識別値がないため、本人順位と行の強調は保留する。

- [x] 上記5条件を再現する試験を追加し、現行コードで失敗することを確認する。
- [x] 最小差分で修正し、対象の統合試験を通す。
- [x] `npm run check` とブラウザ試験を実行し、実行不能なら理由を記録する。

## Task 2: 最新の残作業と申し送り

**Files:** `README.md`、`docs/architecture/task-ledger.md`、`docs/qa/acceptance-evidence.md`、`docs/release/follow-up-status.md`、`docs/handoff/to-claude/2026-11-06-post-merge-followups.md`。

- [x] #11のマージと再確認結果を台帳へ反映し、完了・未確認・利用者の判断を分ける。
- [x] セット補助・正式値・公開・DB登録・タイトルの判断材料を整理する。未承認案をコードへ採用しない。
- [x] 変更範囲を独立レビューし、重要な指摘を修正する。
- [ ] 専用ブランチへ保存し、main宛のPRを作る。

## 追加で確認した不具合と判断

- 独立レビューで、別ゲームの保存プレイを同じrunIdで再開したとき、submitまたは中断が古いキューを変更する経路を再現。beginRunとsubmitにも検査を加え、試験の失敗→成功で確認。
- 多言語対応の要件に対し、app.tsの再開・通知・エラーが日本語固定だった。10キーを既存の15言語表へ追加し、単体試験の失敗→成功で確認。新しい画面・ゲームルールは追加しない。
- 本人順位の表示は、現行の応答で本人を識別できるまで保留。上位30名は通常どおり表示する。
- レビューの軽微な残件：本人順位未確認時の「下の上位30名で確認」の文言は、本人識別対応と合わせて見直す。
