# CLAUDE.md — shatekki

Claude Codeがこのリポジトリで動くとき、まず以下を読むこと。
- docs/requirements.md（ゲーム仕様）
- docs/decision-log.md（01〜33の確定事項）
- docs/open-items.md（未確定の値と細部）
- docs/superpowers/plans/2026-11-06-shatekki-claude-code.md（担当・段階・テスト・PR計画）
- docs/handoff/protocol.md（ChatGPTとClaudeの申し送り規約）
- docs/acceptance-criteria.md（AC01〜AC45）
- data/catalog-candidates.json（100景品・100セットの候補、未定の値はnull）

## 優先するルール
- Claude Opus 5.5は実装を指揮・審査、Claude Sonnet 5.5は独立した実装・デザインを担当。Agent Teamsが使用可能か調べてから、利用量と承認を確認して起動する。使えなければサブエージェント/分離worktreeで代替。
- **Claudeが美術・3D・演出・音をデザイン**する。ChatGPTは仕様管理と不具合・想定外挙動の修正を担当する。
- 決定済み33項目、景品・セット各100種類、初期10発と追加上限、縦向きメインを無断変更しない。
- 判定・点数と見た目の描画を分離。速度や効果を「見た目だけ」で再現してゲーム判定を変えない。
- 相手への質問・不具合は docs/handoff/ へ、元の要件番号・再現・証拠・PRを付けて残す。相手専用の別リポジトリが指定されたらその宛先へ。
- mainへの直接push、AIによるPRマージ、既存スコア削除、無承認のDB変更・本番公開・新規有料利用・秘密鍵の公開をしない。
- 実装はテストの失敗を確認してから修正、通過とレビュー証拠をPRに記す。実施していない動作試験を合格と書かない。
- 毎回、現在のPRや他担当の所有ファイルを確認し、並行編集の衝突を避ける。
- 実機はiPhone Safari縦向きを優先。横向きでは戻す案内を出し、一時停止の状態を守る。

開発はこの計画の段階ごとにPR提出し、**ユーザーによるマージが完了するまではmainの変更があると仮定しない**。同一フェーズの依存作業は先に合意したインターフェースに合わせる。
