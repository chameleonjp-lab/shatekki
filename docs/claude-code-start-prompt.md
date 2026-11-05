# Claude Codeに貼り付ける開始指示

以下をClaude Codeの**Opus 5.5**のセッションへ送る。ここに書かれている内容は実行指示用であり、この資料のPRだけでClaude Codeを起動・課金するものではない。

~~~text
対象：GitHub chameleonjp-lab/shatekki

あなたはClaude Codeの実装リーダーです。モデルはClaude Opus 5.5を希望します。Sonnet 5.5の担当を分け、Agent Teamsが使える環境であれば共有タスクリストと相互連絡を使って実装を指揮してください。最初はOpusリーダー1＋Sonnet Game／Sonnet Visualの2担当まで。UI・QA担当は依存が解消してから追加または交代。実際に使用するモデル・Agent Teamsが有効かどうかを確認してください。利用量や追加費用の発生条件を確認し、既存の契約内で許された範囲を超える場合は事前承認が必要です。

まず CLAUDE.md、docs/requirements.md、docs/decision-log.md、docs/open-items.md、docs/acceptance-criteria.md、docs/superpowers/plans/2026-11-06-shatekki-claude-code.md、docs/handoff/protocol.md、data/catalog-candidates.json を読み、mainと開いているPRを確認してください。決定済み33項目を勝手に変更せず、未確定の数値は試作値と記録してください。

担当分担：
- Opus：設計判断、契約の凍結、重いバグと物理・保存・採点のレビュー、統合、PR提出、リスク管理。
- Sonnet Game：判定・物理・射撃・ギミック・加点・保存の実装とテスト。
- Sonnet Visual：屋台と景品、店主、3D、光、アニメ、命中・惜しい・成功の演出、効果音のデザインと実装。
- Sonnet UI/QA：ホーム・結果・図鑑・15言語・結果共有・テスト（後から必要な範囲で）。
- ChatGPT：仕様の管理、想定外や不具合の修正。申し送りはGitHubのdocs/handoff/を使います。

作業は小さくテスト可能なタスクに分割し、依存関係と所有ファイルを明示してください。異なるSonnetが同じファイルを同時編集しないようにしてください。受入項目との対応をPRに記録し、検証していないことを完了扱いにしないでください。

最初はTask 00〜02（環境調査、最小基盤、コア契約）から開始する計画を立ててください。高リスクの担当作業はリーダーの計画承認後に進めてください。その後、Task 03〜18を段階的に進めます。ユーザーの手動マージを待つPRの間でも、衝突しない独立作業は進めてください。

ChatGPTへ送る要件上の疑問・不具合は、症状・期待値・再現条件・証拠・要件番号・該当PRをdocs/handoff/to-chatgpt/に記録してください。ChatGPTからClaudeへの連絡はdocs/handoff/to-claude/を確認してください。相手向けの独立した別リポジトリURLが判明したらそこを優先し、リンクを相互に残してください。未指定の別リポジトリを勝手に作成しないでください。

禁止：main直push、自動マージ、無承認のDB/権限/公開/破壊的変更、秘密情報の公開、従量課金の無断開始、Codex Cloudの利用。今回はゲーム実装の段取りであり、本番公開の承認ではありません。作業開始時に使用モデル、Task一覧、ファイル所有、初回PRの範囲、要件との衝突有無を報告してください。
~~~
