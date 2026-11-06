# iPhone確認用ページを公開できる形まで準備する

2026年11月6日／ChatGPT。今回の「残る作業を進める」「CIを速くする」という指示に合わせ、公開に使う設定をレビューできる形で用意した。公開そのもの、データベースへの登録、正式な数値の採用は行っていない。

## 用意したものと公開後の範囲

[公開設定のテンプレート](preview-pages.yml.example)を `docs/release/` に置いた。この場所のファイルはGitHub Actionsとして実行されない。公開を承認した後の移動先は `.github/workflows/preview-pages.yml` とする。公開を有効にする変数は追加していない。公開設定自体の手動実行は用意せず、必ず `ci` の成功結果から動く形にした。

公開する場合の対象は、iPhone 17 ProのSafariで操作・音・表示・重さを確かめる**試作**である。景品・セット・採点などの値を正式採用したことにはしない。現状の `src/catalog/config.ts` と `src/catalog/runtime-config.ts` は `prototype` のままで、`src/ranking/config.ts` の `gameSlug`・`canonicalUrl`・`labDetailUrl` も `null` のまま。ランキングへの開始・終了・再送は現状の条件で止まる。この準備では本番に試験送信しない。

公開先の候補は `https://chameleonjp-lab.github.io/shatekki/`。この文書は、実際に開けるページや正式URLの存在を確認した記録ではない。承認後、配信結果が返すURLを実際に開いてから、確認できたURLを記録する。正式URLのコード設定や実験場への掲載は別途扱う。

## CIの成果物をそのまま使う

公開側では、ゲームの作成や全試験を繰り返さない。同じリポジトリのmainに対する `ci` が完了して成功した場合だけ、その実行で作った `dist/` を受け取る。`site-dist` は、ビルド結果を実行間で渡すために保存するファイル一式の名前である。

| 確認する条件 | テンプレートの動作 |
|---|---|
| 対象が同じリポジトリのmainへのpush、またはmainのCIを手動で全実行し、`.github/workflows/ci.yml` の `ci` が成功 | さらに最後のジョブ `test` の成功、ビルド `build` の成功を読み取りで確認する |
| `build` が省略され、`site-dist` がない | 資料だけの変更として公開を省略し、現在のページを保つ |
| ビルド成功後に成果物がない・重複する・期限が切れている、または確認に失敗する | 公開を止める。過去の別実行の成果物へ切り替えない |
| 成果物を受け取る | 起点となったCIの実行番号を明示し、その `site-dist` だけを受け取る。ページの入口 `index.html` も確認する |
| mainが先へ進んでいる | 準備時と配信直前にmainのコミットを読み直し、古い成果物の配信を省略する |

配信を待つ間にmainが変わる場合もあるため、`github-pages` の承認待ちがある場合は、その待機後にもう一度確認する。複数の公開は同時に実行しない。ただしmainの変更とPagesへの配信は別の操作なので、その間の変更を一つの操作として固定する仕組みではない。後続のmainのCIが成功すると、次の配信対象になる。

例えば、コード変更Aの確認中に資料だけの変更Bがmainへ入ると、Aは古いので配信せず、Bには成果物がないため、公開中のページを保つ。公開を有効にした後、この状態から配信するには、GitHubのActions → `ci` → Run workflowでブランチmainを選んで手動実行する。手動実行では全確認とビルドを行い、最新mainの成功した成果物をこの公開設定で受け取る。資料の変更すべてで全確認を繰り返す必要はない。古い成果物を許可して回避しない。

確認・取得を行うジョブはリポジトリとActionsの読み取りだけにする。Pagesへの書き込みと、GitHubが配信用の証明を発行する権限は、配信するジョブだけに付ける。Pages設定の自動有効化はしない。

## 有効にする前の具体的な確認

1. 利用者が「この試作を誰でも開けるPagesへ公開する」ことを選ぶ。[公開・登録の確認書](approval-request.md)の公開範囲を使う。この指示だけから、案C・正式値・正式タイトルの採用やデータベース変更の承認を補わない。
2. `.github/workflows/ci.yml` の `ci` が最後の `test` で必要な確認の結果をまとめ、コード変更時とmainの手動実行時に `build` が `site-dist`（`dist/`）を保存することを確認する。Jobs APIに出るジョブ名も `test`・`build` にそろえる。資料だけの変更では `build` を省略し、成果物を保存しない。手動実行は全確認とビルドを行う。ビルド後に失敗した試験がある場合は、全体と最後の確認も失敗にする。
3. 承認された公開設定のPRで、このテンプレートを `.github/workflows/preview-pages.yml` へ移す。リポジトリのSettings → Pagesで配信元をGitHub Actionsにする。`github-pages` の配信可能なブランチをmainに限定する。設定ファイルはmainに存在してから起動する。有効化の変更もCIの判定対象に含め、初回の配信には最新mainで `build` が成功し、成果物を保存した実行を使う。資料だけの変更では配信しない。
4. 配信後、結果のURLが開けることと、試作表示・ランキングの送信停止を確かめる。[iPhone 17 Proの確認手順17件](../qa/iphone-checklist.md)を実機で行い、結果を記入する。自動試験の成功をSafari実機の成功として記入しない。

この準備で課金設定や追加の有料サービスは変更しない。Supabaseのテーブル、ゲーム登録、既存の記録にも変更を加えない。

## 引き続き決めること

セット成立の扱いは[対応状況の案A〜D](follow-up-status.md#判断材料セット成立と試作値)を引き継ぐ。Cは推奨候補で、採用済みではない。正式値は試作の測定と実機確認の結果を見て選び、採用された値だけを変更する。正式タイトル、本人を区別できる順位表示、採点上限、本番の登録・送信・再送の確認も残る。[要件仕様書](../requirements.md)と[調整記録](../design/tuning-log.md)を判断の基準にする。

## 公開を取り消す場合

公開停止は、Settings → Pagesのメニューで「Unpublish site」を選ぶ操作と、後続の成功CIで再配信されないよう `.github/workflows/preview-pages.yml` を無効にする操作を組み合わせる。設定ファイルを外すだけでは、すでに公開されたページが消えたとは扱わない。停止後はURLで公開が終わったことを確かめる。保存済みのゲーム記録やデータベースの行を削除する手順は含めない。[GitHubの公開停止手順](https://docs.github.com/en/pages/getting-started-with-github-pages/unpublishing-a-github-pages-site)も参照する。

## 公式資料とこの準備で確認できた範囲

GitHub公式の[Pagesの独自ワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[workflow_runの条件と成果物取得](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)、[成果物一覧の読み取り](https://docs.github.com/en/rest/actions/artifacts#list-workflow-run-artifacts)、[実行情報の読み取り](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)を確認した。バージョンの組合せと入力は[Pages成果物の公式README](https://github.com/actions/upload-pages-artifact/blob/main/README.md)、[そのリリース](https://github.com/actions/upload-pages-artifact/releases)、[成果物取得の公式README](https://github.com/actions/download-artifact)、[Pages設定の入力](https://github.com/actions/configure-pages/blob/main/action.yml)も参照した。

手元ではYAMLの読み取り、埋め込んだJavaScript 2本の `node --check`、APIの応答を置き換えた17ケースを確認した。ケースには通常・手動実行の成功、参照先の枝名が設定パスに付いたAPI応答、資料だけの省略、成果物の欠落・重複・期限切れ、最後の確認やビルドの失敗、別リポジトリ・別設定ファイル・許可していない起点、再実行、古いmainを含む。実際のActions・Pages上の起動や配信、公開URLの到達、Safari実機は、公開を有効にした後の確認として残る。
