# 実装の基準記録（Task 00）

作成：2026-11-05（UTC）／担当：Opus（統括）。この文書は調査と技術選定の記録であり、ゲームの試験合格を示すものではない。

## 1. 基準と実行環境

基準にしたmainは `3c619d219b31ebb051e1a88a155ca928c721d966`（PR #6マージ後）。この時点で開いているPRはなく、PR #3〜#6はマージ済み。Issue #1と#2は要件資料の初期記録として開いたまま残っている。`docs/handoff/to-claude/` にはChatGPTからの計画検証メモ `SHK-20261106-CHATGPT-PLANREVIEW` が1件あり、今回の作業開始時に読んだ（ACKは本PRの本文と台帳に記録する）。

作業はClaude Codeのクラウド実行環境（Anthropic管理のコンテナ）で行う。`claude --version` の表示は `2.1.318`。利用者のPCは使わない。

| 確認したこと | 結果と根拠 |
|---|---|
| 統括のモデル | `claude-opus-5-5`。セッション情報（get_session）の設定値と、直近の応答に使われたモデルの両方がこの値だった。 |
| Sonnet担当のモデル | `claude-sonnet-5-5`。サブエージェントを `sonnet` 指定で起動し、そのエージェント自身のシステム情報に書かれた識別値を報告させた。セッション情報ほど強い証拠ではないため、各担当の起動時に同じ確認を行う。 |
| Agent Teams | 有効化の環境変数（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）は未設定。今回は有効化せず、サブエージェントを別のgit作業場所（worktree）で動かし、同じ役割分担を保つ。 |
| 利用枠 | 5時間枠で「allowed」、超過課金の利用なし（セッション情報）。契約の詳細な上限は見えないため「不明」とする。 |
| ネットワーク | npmレジストリとGitHubへは接続できた。実機のiPhoneはこの環境から操作できない。 |
| ブラウザ | 自動操作に使えるのはChromiumのみ。WebKit（Safariの描画エンジン）は入っておらず、追加導入もしない。iPhoneの画面幅をまねたChromiumの結果は「Safari実機の確認」とは扱わない。 |

## 2. 承認されている範囲

利用者の依頼文（2026-11-05）により、Task 00〜18の実装・試験・PR作成は許可されている。マージ、本番公開、外部公開設定、DB・権限の変更、追加費用、Codex Cloudの利用は許可されていない。テスト用ページの外部公開も許可されていないため、Task 17のiPhone実機確認は公開承認が出るまで「実施不能」として残す。

## 3. 技術選定

| 用途 | 採用 | 版・ライセンス | 選んだ理由 |
|---|---|---|---|
| 言語 | TypeScript | 5.9.3 / Apache-2.0 | 型で個体IDと種類IDなどを分けられる。7系はツールの対応実績が少ないため避けた。 |
| ビルド | Vite | 8.3.4 / MIT | 同じ組織のfaitofuraitoで実績がある構成。 |
| 3D描画 | Three.js | 0.186.1 / MIT | 同上。軽量な形の組合せで景品100種類を作れる。 |
| 物理計算 | Rapier（`@dimforge/rapier3d-compat`） | 0.21.0 / Apache-2.0 | Node上のテストでもブラウザでも同じ処理が動く。形を動かして当たりを調べる「掃引判定」で、速いコルクが薄い棚をすり抜ける失敗を防げる。 |
| 単体・統合試験 | Vitest | 4.1.12 / MIT | 5系は公開から日が浅いため、保守が続く4系を選んだ。 |
| ブラウザ自動試験 | Playwright | 1.63.0 / Apache-2.0 | 環境に入っているChromiumと版が合う。 |

npm 10.9.9でVitestを入れると内部エラー（`Cannot read properties of null (reading 'edgesOut')`）が起きた。そこで依存関係の固定ファイル（package-lock.json）だけをnpm 11.6.2で作り、通常の `npm ci`（npm 10）で再現インストールできることを確かめた。

Rapierの判定はコルクと景品で役割を分ける。景品・棚・壁はRapierの剛体として扱い、コルクはこちらのコードで「球を進行方向へ動かして最初に当たる物を調べる」方式で進める。当たった点と面の向きから反射を計算し、景品には装填の結果に応じた衝撃と耐久値の減少を与える。周期的に動く景品は、台に固定されている間は物理側で台ごと動かし、景品だけが勝手に落ちることはない。強く当たるか耐久値が0になると台から外れ、通常の剛体になる。

同じ操作と乱数の種から同じ結果が出ることは、同じ環境の中での再現試験のために使う。別の端末どうしの完全な一致は保証しない（計画1.1の範囲どおり）。

## 4. カメレオンJPの共通仕様の調査

組織の公開リポジトリを読み取り専用で取得して調べた。変更は一切していない。

`chameleonjp_lab` の `docs/chameleonjp-lab/17_browser_game_common_spec.md`（2026-10-31）が共通画面の最新の規約である。名前は任意で、空欄でもプレイ・結果・閲覧・共有ができる。開始時の名前をそのプレイに固定し、後から名前を入れても過去の匿名結果は公開しない。「Xでシェア」は黒地・白字で、投稿画面を開くだけにする。15言語、音の初回オン、iPhone 17 Pro Safariを優先することも書かれている。

ランキングの受付は、同じ結果を再送しても1件だけ登録する方式（`12_ranking_submission_contract_v1.md`）を新規ゲームに使う決まりである。本番のSupabase（プロジェクト `mlpnjgezrnhdxsxolyzj`）を読み取りだけで確認したところ、`start_game_play_v1`、`finish_game_play_v1`、`submit_score_idempotent_v1`、`get_best_score_ranking` などは存在し、匿名の利用者から呼べる状態だった。名前は前後の空白を除いて1〜20文字という条件がある。

一方、`public.games` の62件の中に射的ゲームの登録はなかった。登録されていないゲームの送信はデータベース側で拒否される。つまり正式なゲーム識別値（game_slug）、正式URL、実験場の詳細ランキングURLは、まだ存在しない。新規ゲームはGitHub Pages（`https://chameleonjp-lab.github.io/<リポジトリ名>/`）を使う原則があるが、このリポジトリのページは公開されていないため、そのURLを正式値として埋め込まない。

この結果から、Task 16のランキング接続は「v1の受付方式に沿った処理を作り、模擬の通信で試験する」ところまで進める。DBへの登録・公開はTask 18で利用者の承認を得てから行う。

## 5. 契約（Task 02）と所有範囲

共有する型は `src/contracts/` に置き、Opusだけが編集する。描画と物理が同じ寸法を使えるよう、屋台の棚・壁・仕掛け・店主・隠し対象の位置は `src/contracts/layout.ts` の1か所にまとめた。値はすべて試作（layout-v1-prototype）である。

| 担当 | 所有するパス |
|---|---|
| Opus | `src/contracts/`、`src/main.ts`、`src/app.ts`、`src/app.css`、`src/environment.ts`、package/lockfile、CI、`scripts/`、`docs/architecture/` |
| Game（Sonnet） | `src/core/`、`src/sim/`、`src/catalog/`、`src/persistence/`、対応する単体・統合試験 |
| Visual（Sonnet） | `src/view/`、`src/audio/`、`docs/design/` |
| UI/QA（Sonnet） | `src/ui/`、`src/i18n/`、`src/ranking/`、画面・通信の試験 |

画面から得点・耐久値・獲得・弾数・一射の確定を指定するコマンドは作っていない。`parseCommand` は未知の種類、余分な項目（例：`{type:'FIRE', score:999}`）、有限でない数値を拒否する。装填の良し悪しは、画面からの値ではなくゲーム側の時計から計算する。

## 6. 試作値の扱い

調整用の数値はすべて `TuningConfig` と、Task 13で作る景品・セットの実行設定に集め、`valueStatus`（prototype／proposed／approved）を付ける。1つでもprototypeが残っていれば、そのプレイは正式ランキングの対象外になる（`isOfficialRankingEligible`）。正式な値の案は、根拠を添えてChatGPT向けの申し送りに書き、利用者の採用を待つ。

## 7. 未確定13分類の割当

| ID | 試作の作成 | 正式化の判断 |
|---|---|---|
| O01 景品の能力値 | Game（Task 06/13）＋Visual（形） | ChatGPT整理→利用者 |
| O02 セットの点・ヒント | Game（Task 09/13）＋UI（翻訳） | ChatGPT整理→利用者 |
| O03 技の加点 | Game（Task 09） | ChatGPT整理→利用者 |
| O05 抽選の重み | Game（Task 03） | ChatGPT整理→利用者 |
| O07 上限・猶予 | Game（Task 05/08） | ChatGPT整理→利用者 |
| O08 仕掛けの細部 | Game（Task 08） | ChatGPT整理→利用者 |
| O09 装填・手ブレ | Game＋UI（Task 07） | 実機確認→利用者 |
| O11 保存 | Game（Task 10） | Opus検証→ChatGPT整理 |
| O12 店主・隠し対象 | Game（Task 08）＋Visual（Task 12） | ChatGPT整理→利用者 |
| O13 タイトル・見た目 | Visual（Task 11/14） | 利用者 |
| O14 接続先・URL | Opus（Task 16/18） | 利用者（DB登録・公開の承認） |
| O15 性能 | Opus＋Game（Task 05/17） | 実機の証拠 |
| O16 素材・翻訳・音 | Visual＋UI（Task 13/15） | 権利・表示の確認 |

## 8. 確認できない・していないこと

iPhone実機での操作と性能、Safari（WebKit）での表示、本番URLでの動作、正式ランキングへの登録は、この環境と現在の承認範囲では確かめられない。これらは未実施として台帳に残す。
