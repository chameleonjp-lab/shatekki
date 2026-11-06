# タスク台帳（Opusが更新）

状態は `READY → WORKING → REVIEW → PR_OPEN → MERGED`、止まっているものは `BLOCKED`。担当エージェントの「完了」は証拠付きのREVIEWまでで、マージ済みとは扱わない。最終更新：2026-11-05 Opus（Task 17）。

基準main：`3c619d219b31ebb051e1a88a155ca928c721d966`

| Task | 内容 | 担当（実モデル） | 状態 | ブランチ／PR | 試験の証拠 | 阻害・次の作業 |
|---|---|---|---|---|---|---|
| 00 | 調査・制約確認 | Opus（claude-opus-5-5） | PR_OPEN | `feat/p0-foundation-contracts` | `docs/architecture/implementation-baseline.md` | マージ待ち |
| 01 | 起動・試験基盤 | Opus | PR_OPEN | 同上 | typecheck／unit 30件／integration 5件／build／e2e 6件（Chromium） | CIの初回実行結果をPRで確認 |
| 02 | 契約と所有境界 | Opus | PR_OPEN | 同上 | `tests/unit/contracts.test.ts` | — |
| 03 | 候補検査・抽選・設定 | Game（claude-sonnet-5-5） | PR_OPEN | `feat/p1-game`→`feat/p1-integration` | unit/catalog 11・unit/draw 16 | 100景品・100セットの値はすべて試作 |
| 04 | 一射の状態と弾数 | Game（claude-sonnet-5-5） | PR_OPEN | 同上 | unit/shot-flow 26 | — |
| 05 | 物理・命中 | Game（claude-sonnet-5-5） | PR_OPEN | 同上 | unit/collision 14 | 仕掛けの効果はTask 08 |
| 06 | 景品・周期運動・補充 | Game（claude-sonnet-5-5） | PR_OPEN | 同上 | unit/prizes 8・motion 8・replenish 7、integration/full-run 3 | 得点はTask 09で拡張 |
| 07 | 装填・手ブレ・最小操作画面 | Game（計算）＋Opus（接続・最小UI） | PR_OPEN | `feat/p1-integration` | unit/aim 12・controller 5・controls-model 3、integration/aim-parity、e2e/shot-smoke 3×2画面 | UIの本実装はTask 14（UI/QA） |
| 08 | 装置・変身・店主・落下猶予 | Game 2（claude-sonnet-5-5） | PR_OPEN | `feat/p2-game`→`feat/p2-integration` | unit/gimmicks・devices-sim・transform-grace、integration/devices-run | 効果量・対象選びは試作（O08） |
| 09 | セット・採点・一射確定 | Game 2、Opus審査 | PR_OPEN | 同上 | unit/scoring | 技・セット点は試作（O02/O03） |
| 10 | 保存・停止・中断 | Game 2、Opus審査・配線 | PR_OPEN | 同上 | integration/checkpoint、e2e/reload 4 | 実機のlocalStorage・プライベートモードは未確認 |
| 11 | 描画基盤・美術方針 | Visual（claude-sonnet-5-5）＋Opus（照準の当たり判定合わせ） | PR_OPEN | `feat/p1-view`→`feat/p1-integration` | integration/view-contract 22 | 店主が初期視点の画面外。配置の見直しを検討 |
| 12 | 命中・惜しい・結果演出 | Visual 2（claude-sonnet-5-5）＋Opus配線 | PR_OPEN | `feat/p3-visual`→`feat/p4-integration` | unit/effects・classify・result-vfx | 実際の画面での演出の見え方は実機未確認 |
| 13 | 100景品の実行データ・素材・音 | Game（データ）＋Visual（形・音） | PR_OPEN | `feat/p1-game`・`feat/p1-view`・`feat/p3-visual` | unit/catalog・audio、integration/view-contract | 値はすべて試作。試聴なし |
| 14 | 共通画面・名前・図鑑・結果 | UI/QA＋Opus配線 | PR_OPEN | `feat/p4-ui`→`feat/p4-integration` | integration/screens、e2e/screens 5×2画面 | — |
| 15 | 15言語・共有 | UI/QA 2 | PR_OPEN | `feat/p4-i18n-content`→`feat/p4-integration` | unit/i18n・i18n-content | 母語話者の確認なし（O16） |
| 16 | ランキング（模擬通信） | UI/QA＋Opus | PR_OPEN（本番はBLOCKED） | `feat/p4-ui`→`feat/p4-integration` | integration/ranking・security | 本番接続はDB登録の承認が必要 |
| 17 | 公開前の統合確認 | Opus | PR_OPEN | `feat/p6-acceptance` | integration/balance-probe・performance・acceptance-composite、e2e/long-text・performance、docs/qa/* | iPhone実機は公開承認待ち。セット成立率の判断を申し送り（SHK-20261106-CLAUDE-002） |
| 18 | 承認済みの公開と公開後確認 | Opus | BLOCKED | — | — | 利用者の公開承認・DB登録承認が必要 |

## 再開するときの手順

セッションが止まった場合、次のセッションは以下を読んでから続ける。完了済みの工程を繰り返さない。

1. 最新のmainと開いているPRを取得し、この台帳と各PR本文の「残作業」を読む。
2. `docs/handoff/to-claude/` の未解決メモを読む。
3. 台帳でREADYまたはWORKINGのTaskから、依存が満たされたものを選ぶ。WORKINGのブランチが残っていれば、そのブランチから続ける。
4. 未マージの親PRに依存するときは、親PRの番号と基準コミットをPR本文に書く。
