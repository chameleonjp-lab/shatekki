# 同名の別人を分け、本人の順位を取得するための変更案

2026年11月6日／ChatGPT。**調査と設計の下書き。採用・DB変更・本番接続は未承認。** SQLの実行、試験スコアの送信、設定変更はしていない。現在の `valueStatus: 'prototype'`、`gameSlug: null` は維持する。

## 調査で分かったこと

現在の共通基盤では、表示名から前後の空白を除いた文字列を参加者の識別に使っている。同じ名前の別人は同じ記録へ集計される。射的側だけに別の番号を保存しても、現行の受付関数が受け取らないため解消できない。

| 確認したもの | 実際の処理と分かる範囲 |
|---|---|
| `start_game_play_v1` | 最新の公開SQLは `p_start_id, p_display_name, p_game_slug, p_client_version` を受け取る。`normalize_player_name` で名前を変換し、`public.players` へ `on conflict (normalized_name)` で保存する。開始の再送は `start_id`、ゲーム、名前、クライアント版で照合する [S1]。 |
| `submit_score_idempotent_v1` | 最新の公開SQLは `p_play_id, p_submission_id, p_display_name, p_game_slug, p_score, p_client_version` を受け取る。`public.game_scores` の検索・更新条件は `(normalized_name, game_slug)`。返す `result_best_score` も、この名前単位の集計である [S1]。 |
| `get_best_score_ranking` | 実験場の実装が `p_game_slug` と `p_limit: 100` で呼ぶことを確認した [S3]。2026年10月31日のDB監査には、名前単位の `game_scores`、`rank()`、`first_score` が非nullかつ `ranking_status = 'normal'`、上限1〜100と記録されている [S4]。**関数本体のSQLは公開ツリーで見つからず、今回の時点の稼働DB定義は未確認**。 |
| 既存の安定した本人番号 | 共通v1に、表示名と独立した参加者番号・本人用資格情報は見つからなかった。`start_id`、`play_id`、`submission_id` は開始・プレイ・送信を識別する番号で、継続する参加者の番号ではない。監査でも独立した番号の追加を未解決事項としている [S1][S4]。 |
| 射的のクライアント | `src/ranking/client.ts` はv1の受付を使い、一覧の行には `rank_no, display_name, first_score, best_score, play_count, updated_at` しか持たない。本人番号がないため、本人順位と行の強調を保留している [L1]。 |

「上位30名の中に名前と点が一致する行が1つある」ことは、本人である証拠にならない。送信結果の `result_normalized_name` も現在は名前そのものなので、本人の識別には使えない。

既存の監査は当時の読み取り結果であり、今日のDBを今回読み直した結果とは区別する。公開SQLからは名前単位の動作を直接確認できるが、未公開の追加変更の有無は分からない。

## 提案する本人の扱い

表示名とは別に、ゲームごとの参加者番号 `participant_id` をサーバーで発行する。同じブラウザの保存を利用し、名前を変えても同じ参加者の自己ベストを継続する。同じ名前でも参加者番号が違えば別の行として集計する。

番号だけを知っても記録を変更できないよう、本人用の十分長い秘密の文字列を合わせて使う。本案では、ブラウザが安全な乱数から作る32バイトの文字列を資格情報にする。これは公開用のSupabaseキーとは別であり、ソース・共有URL・ログ・公開一覧に出さない。サーバーにはそのハッシュだけを保存する。実際のハッシュ関数と導入済みの拡張機能は、変更SQLを作る前にメタデータで確認する。

この方法が継続して識別できるのは、同じ保存を持つブラウザの参加者である。別の端末や保存消去後まで同じ人と認める方法は含まない。端末間の引継ぎが必要か、保存消去後の扱いをこの範囲でよいかは採用前に決める。番号だけから実在の人が一意であるとは保証しない。

## 新しい受付の具体案

以下の関数名と項目は**新設の案**であり、現在のDBに存在するとは扱わない。既存v1の引数や応答を置き換えず、v2として追加する。

共通する本人確認項目は `p_participant_id uuid` と `p_credential_secret text`。ゲームと集計対象の版は `p_game_slug text`、`p_rules_version text`。開始から再送完了まで固定する。本人番号を持たない閲覧では本人確認項目を両方nullにする。

| 関数案 | 引数 | 応答・必要な検査 |
|---|---|---|
| `register_ranking_participant_v2` | `p_game_slug, p_registration_id uuid, p_credential_secret` | `accepted, participant_id, registration_id, game_slug, duplicate`。登録用番号と秘密の文字列を送信前にブラウザへ保存し、同じ要求の再送には同じ参加者番号を返す。同じ登録番号で別の秘密を渡した場合は拒否する。公開中でv2が選ばれたゲームだけ受け付ける。 |
| `start_game_play_v2` | 共通の本人確認・ゲーム・版、`p_start_id uuid, p_display_name text, p_client_version text` | `accepted, participant_id, start_id, play_id, game_slug, rules_version, display_name, client_version, duplicate`。有効な開始時の名前を確定し、以後の送信で名前を差し替えない。再送は本人・ゲーム・版・名前・クライアント版の全てが一致した場合のみ同じ `play_id` を返す。 |
| `finish_game_play_v2` | 共通の本人確認・ゲーム・版、`p_play_id, p_result_type, p_reached_wave, p_score, p_client_version, p_ranking_score` | `accepted, participant_id, play_id, game_slug, rules_version, score, duplicate`。本人が開始したセッションだけを確定する。射的の通常終了は `game_over`、`reached_wave = 1`、`ranking_score = null`。結果確定後は同じ内容の再送だけを許す。 |
| `submit_score_idempotent_v2` | 共通の本人確認・ゲーム・版、`p_play_id, p_submission_id uuid, p_score, p_client_version` | `accepted, participant_id, result_submission_id, result_play_id, game_slug, rules_version, result_best_score, is_first_play, is_new_best, was_duplicate`。確定済みのプレイだけを受け付け、点は終了時の点と一致させる。開始時の名前をサーバーから使い、名前を提出者の証明にしない。 |
| `get_participant_best_score_ranking_v2` | `p_game_slug, p_rules_version, p_limit integer`、任意の本人確認項目 | 同じ集計時点の `game_slug, rules_version, fetched_at, rows, me` を1回で返す。一覧は最大100人、ゲーム側は30人。本人確認の両項目なしでは `me = null`。片方だけ・不正な資格情報は拒否する。 |

資格情報の不一致は本人確認の失敗、同じ番号で内容が違う場合は競合として返し、自動再送を続けない。通信切断・時間切れ・一時的なサーバー障害・回数制限は、現在と同じ番号を使って再送する。送信の応答を失っても、`submission_id` と `play_id` の一意制約で記録と回数を増やさない。

`result_best_score` はその送信の受付時に確定した応答として保存し、再送でも同じ応答を返す。**現在の順位は送信応答の古い点から求めず、成功後に取得用関数で読み直す。**

取得結果の各 `rows` は、既存の6項目に `participant_id` を加える。`me` は `participant_id, ranked boolean, best_score, rank_no` を返す。対象記録なし・除外中では `ranked = false, rank_no = null` とし、他人の行を代わりに選ばない。名前と点の一致による検索は実装しない。

順位は、対象版で公開対象になっている記録を参加者番号ごとにまとめた自己ベストから計算する。高い点が良い場合は「本人より良い自己ベストを持つ参加者数＋1」と同じ順位にする。`rank()` を使う場合の並び順には点だけを入れる。同点なら1位・1位・3位になる。

一覧を安定して表示するための追加の並び順は、順位計算の後で `rank_no, updated_at, display_name, participant_id` とする案。本人の行を見つけてから一覧を30人へ絞るのではなく、**全対象参加者から本人順位を計算し、それとは別に一覧を30人へ絞る。** 31位以下でも本人順位を取得できる。表示順の向きは、公開されていない現行関数の定義を確認してから統一する。

名前変更は次に開始するプレイから適用し、過去のプレイの名前は書き換えない。一覧の表示名には、その参加者の最新の公開対象送信が持つ開始時の名前を使う。名前なしで始めたプレイを、後から名前を付けて公開しない。

## 既存記録を保持する追加方法

最初の導入対象を、まだ正式登録していない射的1ゲームに限定する案。既存ゲームの名前単位の記録はそのまま残す。以前に混ざった同名の記録を本人ごとに分ける根拠は見つかっていないため、名前一致だけで新番号へ移さない。

| 追加対象 | 最小限の構造案 |
|---|---|
| `public.games` の追加列 | `ranking_identity_mode`（既定値 `legacy_name`、新方式 `participant_v2`）と `ranking_rules_version`（既存ゲームはnull）。新方式を選んだ登録だけ版を必須にする。他の登録値・有効状態を変更しない。 |
| `private.ranking_participants_v2` | `participant_id` を主キーとし、`game_slug, registration_id, credential_hash, ranking_status, created_at`。ゲームと登録番号の組を一意にし、参加者番号とゲームの組も参照可能にする。同名を一意制約にしない。 |
| `private.game_play_sessions_v2` | `play_id` 主キー、`start_id` 一意。参加者番号・ゲーム・版・開始時の名前・クライアント版・開始日時・終了結果・終了日時を保存する。本人とゲームの組を外部キーで保証する。中断した射的はスコア送信しない。 |
| `private.score_runs_v2` | 送信番号とプレイ番号をそれぞれ一意にし、参加者番号・ゲーム・版・点・受付日時・公開状態・再送用の固定応答を保存する。セッションの確定結果に一致するものだけ追加する。初期段階はこの表から共通の集計関数で自己ベストを求め、既存の `game_scores` の主キーを変更しない。 |

新しい表は行の直接読み書きを公開ロールへ許さず、必要な関数だけを公開する。関数の検索先を空にし、表と関数を明示する方式は現行の安全策を引き継ぐ [S1][S2]。大量の履歴に対する速度は未測定なので、参加者・ゲーム・版・公開状態・点に合わせた索引を用意し、実行計画を見てから集計結果の別保存が必要か決める。

旧受付へ新ゲームを送って名前単位の別集計が作られる経路も防ぐ。v1および旧受付は、`participant_v2` が選ばれたゲームだけ契約違いとして拒否する案。既存ゲームの既定値は `legacy_name` のままなので、既存受付を一括停止しない。ただし現在の全受付関数・トリガーはGitHubだけでは網羅できず、**この拒否条件を実装する前にDBメタデータで全経路を確認する必要がある。**

実験場の詳細ページとの一致は必須。`get_best_score_ranking` へ新方式の分岐を追加し、新しい共通集計から既存6項目の形で返す案なら、詳細ページは同名の2行をそのまま表示できる。射的の本人向け取得も同じ内部集計を使う。`get_game_play_stats`、`get_play_count_ranking` も対象ゲームだけ新しい表へ分岐させ、開始数・完了数・人数の意味を合わせる。これらの**現行関数本体・権限・既存専用処理は、変更SQLの作成前に取得する**。不明な定義を推測で置き換えない。

過去の記録があるゲームへ将来広げる場合、旧記録を表示する方法・版の境界・新旧の人数と回数をどう数えるかを別に決める。旧記録の消去、名前からの自動引継ぎ、別ランキングへの無断分割はしない。射的にも既存の本番記録がないことは、正式登録の直前に再確認する。

## 射的側で変える場所

`src/ranking/client.ts` に新契約用の番号と資格情報の取得を追加し、`src/ranking/retry.ts` の保存へ `participantId`、契約版、ルール版を追加する。資格情報はゲームごとの専用保存へ置き、送信待ちの各行へ重複して入れない。待機行には開始時の参加者番号を固定する。保存を失った待機行を新しい参加者へ付け替えず、元の記録を保持した失敗状態にする。

既存v1の送信待ち・送信済み保存は消さず、v2用の別キーと形式を追加する。初期化・破損・別ゲームのデータ・複数タブを考慮し、安全な乱数や保存を使えない場合は新しい本人番号で送信を始めない。匿名・試作・提案・中断・未登録に対する既存の送信禁止も維持する。

`src/ui/result.ts` は、登録成功後の `me` が持つ自己ベストと順位を一組で表示し、`participant_id` が一致した行だけを強調する。取得に失敗した場合は「本人の順位を取得できませんでした」と再試行を示す。「下の上位30名で確認」は使わない。匿名で始めた結果では、保存済みの本人番号があっても本人順位を表示しない。

端末内の `src/persistence/profile-store.ts` の自己ベストには、試作や匿名の点も含まれ得る。正式ランキングの自己ベストと数が違う場合に、その端末内の点へ他の点の順位を付けない。「この端末の自己ベスト」と「登録済み自己ベスト・順位」を区別して表示する案を、画面要件と合わせて確認する。

## 実装・適用の順序と確認

1. 本案の本人範囲とDB変更方針を確認した後、関数本体・表・制約・権限・拡張機能をメタデータだけで読み直す。正式タイトル、ゲーム識別値、URL、正式な数値は別の未決事項として残す。
2. ローカルの試験用DBで追加変更と新関数を作り、既存データの検証用記録を残したまま新旧両方の試験を行う。移行と復帰のSQLはこの段階でレビューできる形にする。本番への適用は別途承認後とする。
3. 同名同点の別参加者、名前変更、低い点の再送、上位30名より下の本人、同点1・1・3、応答喪失、他人の番号だけでの送信拒否、資格情報喪失、匿名の後付け登録拒否を検証する。旧ゲーム・旧記録と旧関数の応答が変わらないことも確認する。
4. 実験場と射的の両方を同じ集計へ接続する変更をそろえる。正式登録前に射的の既存記録の有無を再確認し、承認後にだけ対象ゲームを新方式として登録・有効化する。iPhone Safariで確認するまでは完了扱いにしない。
5. 問題が出た場合は対象ゲームの受付を無効化し、記録・新しい表・資格情報を消さずに保持する。名前単位の受付へ戻して継続させない。射的の送信設定を無効へ戻しても、保存済みの送信待ちは保持する。

この文書によって本人順位が実装済みになるわけではない。現時点の残件は、本人の範囲の採用、現行DB定義の確認、追加変更の実装とレビュー、実験場側の対応、承認後の適用と本番確認である。

## 根拠と参照版

GitHubコネクターで `chameleonjp-lab/chameleonjp_lab` のmainを読み、ブランチ情報でもコミット `c72ff7fae7ca93f3991484692f98693b4c549fc1`（2026年11月2日）を確認した。以下はそのコミットに固定した参照。SQLファイルは読み取りのみ。

| ID | 出典 | 確認した位置／ファイルのblob SHA |
|---|---|---|
| S1 | [最新の開始・終了・送信SQL](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/c72ff7fae7ca93f3991484692f98693b4c549fc1/docs/chameleonjp-lab/sql/20260928083531_register_start_only_as_retire_v1.sql) | 開始14〜182行、送信340〜664行。名前単位の集計検索579〜584行と更新618〜627行。`190e2f7f500d2b4d7c12a4fe845a5f67041f1909` |
| S2 | [最初のv1追加SQL](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/c72ff7fae7ca93f3991484692f98693b4c549fc1/docs/chameleonjp-lab/sql/20260828015126_ranking_submission_contract_v1.sql)／[開始の再送対応](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/c72ff7fae7ca93f3991484692f98693b4c549fc1/docs/chameleonjp-lab/sql/20260829065129_ranking_start_idempotency_v1.sql) | セッション表の名前外部キー・一意制約・公開権限。`c855a6970014b047e2dd7918bf149b5824b7e69b`／`730a96e4d11b544f1176edeed6088aab7b34dbb2` |
| S3 | [実験場の詳細ランキング実装](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/c72ff7fae7ca93f3991484692f98693b4c549fc1/ranking.html#L2610) | 2610〜2618行の `fetchBestRanking`。`de1ce4dbf4ee24519ed2f8d7769516c49c04f464` |
| S4 | [2026年10月31日のDB監査](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/c72ff7fae7ca93f3991484692f98693b4c549fc1/docs/implementation/2026-10-31-db-audit.md) | 14〜36行の本人識別、69〜84行の一覧集計。関数定義の監査スナップショットを公開成果物に含めないとの記載あり。`fa5463f5388e86dbac8956af72ec669343eb7bdf` |
| S5 | [v1の受付仕様と適用履歴](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/c72ff7fae7ca93f3991484692f98693b4c549fc1/docs/chameleonjp-lab/12_ranking_submission_contract_v1.md) | 4件の適用記録と契約。`7f3c52c248eb7850adf44e161ed71ad59edbaa1b` |
| L1 | [射的の要件](../requirements.md)／[本人識別を残件へ引き継いだ申し送り](../handoff/to-claude/2026-11-06-post-merge-followups.md)／[元の申し送り](../handoff/to-chatgpt/2026-11-06-0010-claude-prototype-values-and-set-odds.md) | 読み取り基準 `shatekki` の `e5feaf28df8e4a81e8c5fae53b06d5a2162564eb`。要件8〜10節、`src/ranking/*.ts`、`src/ui/result.ts`、`src/persistence/profile-store.ts` を確認。 |

`get_best_score_ranking` の公開されていない関数本体、今日のDBとの差分、端末間で使える既存の本人トークンがあるかは、この調査では分からない。これらを確認せずに本番用の置換SQLを作らない。
