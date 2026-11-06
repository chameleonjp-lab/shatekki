# PR #19：効果結果パネルのE2Eタイムアウト修正

```text
ID: SHK-20261106-CHATGPT-006
発信/宛先: ChatGPT → Claude Code（統括・UI・試験担当）
種別: 不具合（CIの時間依存。ゲームの仕様変更なし）
重要度: P2
配送状態: POSTED（PR #19 のブランチへ反映。Claudeの受領は未確認）
作業状態: FIX_PROPOSED（未マージ）
送信先repo・PR/Issue URL: https://github.com/chameleonjp-lab/shatekki/pull/19
基準main SHA: 9bf7b69818029ae4f48a5b4f8a6f2e02eb5a243d
調査開始時のPR head: bcb3fbab7ec31f4e1a0b7d88f055acc8a8b61a77
対象branch: feat/eg07-expanded-ui
修正コミット: bb3ff788f80078b0e8be396eddd3231d6c2b9a5c（テスト修正。本メモは後続コミット）
対象ファイル: tests/e2e/expanded-gameplay.spec.ts（質問→回答→効果結果の1テスト）
対象決定/AC: D35、CH-AC12・14・15・17のブラウザ確認
担当/所有パス/次担当: 利用者の今回の依頼でChatGPTが上記テストを修正。反映後の継続担当はClaude。
必要な利用者承認: 今回の「失敗解消するまで対応」「Claude Code向け申し送りもドキュメント」の依頼で修正・PR反映は許可済み。マージ・公開・正式値採用は別判断。
返信先: docs/handoff/to-chatgpt/ に同じ案件IDと読んだSHAを記録する
```

## 原因と再現

元の失敗は [CI run 42221058215](https://github.com/chameleonjp-lab/shatekki/actions/runs/42221058215)、[browser (1)](https://github.com/chameleonjp-lab/shatekki/actions/runs/42221058215/job/127903102925)。`iphone-portrait-chromium` の `a cork on the shopkeeper asks one question; one answer continues the game (CH-AC question flow)` が `results.click()` で90秒のテスト上限に達した。`test` ジョブの失敗はその集約結果で、別の原因ではない。node・build・browser (2) は成功していた。

`src/ui/effect-results.ts` のカードは表示後5,000msで自動的に閉じる。テストは表示確認のあと、テキスト取得・2つの `boundingBox()`・クリックを順に行っていた。CIのトレースでは約23.2秒でカードが表示され、約27.2秒でクリック開始、約28.2秒には非表示になっている。内容や配置が間違っていたのではなく、遅い実行環境で検査・操作の往復が表示時間を使い切る競合だった。

手元でもクリック直前に一時的に `await page.waitForTimeout(5500)` を入れ、クリックの上限を1,000msにすると同じ非表示待ちで失敗した。修正後は同じ遅延を入れても両画面設定で成功した。この再現用の待機と短いクリック上限は最終差分から除いてある。

## 修正内容

- この1テストだけ、ページ遷移前に Playwright の `page.clock.install()` を呼ぶ。
- 質問が表示され、回答待ちで物理が止まっている地点で時計を止める。結果カードのタイマーが作られる**前**に止めるのが要点。
- 回答後は `page.clock.runFor(100)` と `expect.poll` で、本物の物理・確定処理をカードの表示まで進める。表示後は時計を止めたまま、内容・配置・通常の `locator.click()` による閉じ方を検査する。
- 質問回数1、台帳1件、店主の初回加点、弾数保存式の検査も維持する。

製品の5秒タイマー、物理、得点、抽選、保存、見た目、CIの選択規則は変更していない。クリックの強制化、失敗の握りつぶし、リトライ追加、テストのスキップで今回の失敗を回避していない。自動消去とタップの伝播防止は既存の `tests/unit/effect-results.test.ts` でも検査している。

## 検証

上記修正コミットと同じテスト差分で手元検証した。環境は Node v24.22.1 と Playwright 1.63.0 / Chromium 153。CIは既存の Node 22 設定を使う。2画面設定は `402×874` と `375×600` で、iPhone Safari実機の結果ではない。

| 確認 | 結果 |
|---|---|
| `npm run typecheck` | 成功 |
| `npm run test:unit` | 711件成功、失敗・スキップ0 |
| `npm run test:integration` | 247件成功、失敗・スキップ0 |
| `node --test tests/ci/*.test.mjs` | 150件成功、失敗・スキップ0 |
| 公開用・内部試作用ビルド | 両方成功（既存の大きいchunkの警告あり） |
| 修正対象のE2E、通常実行 | 両画面の2件成功 |
| 修正対象のE2E、5.5秒の遅延を加えた再現実験 | 修正前は非表示待ちで失敗、修正後は両画面の2件成功 |
| `CI=true CI_PREBUILT=true npm run test:e2e` | 全72件成功、失敗・スキップ・flaky 0（約3.2分） |
| 差分の独立レビュー | 対象のテスト修正に指摘なし。PR全体の完成判定ではない |

GitHubでの結果は [PRのChecks](https://github.com/chameleonjp-lab/shatekki/pull/19/checks) の対象headで確認する。本メモの手元検証と、別環境で実行するActionsの結果を混同しない。

基本の再実行手順（リポジトリ直下）：

```bash
npm ci
npm run typecheck
npm test
node --test tests/ci/*.test.mjs
npm run build
npm run build:expanded
CI=true CI_PREBUILT=true npm run test:e2e
```

この作業環境ではnpmのキャッシュとChromiumを `/tmp` に配置した。別環境でChromiumがなければ `npx playwright install --with-deps chromium` が必要。最初の制限付き実行では統合試験内のビルド起動が `spawnSync npx EPERM` になったため、実行環境のネットワーク権限を付けて統合試験を再実行した。製品コードの修正で回避していない。

## Claude Codeで続けるとき

1. 最新のPR headとこの修正を取り込み、同じテストを古い版へ戻さない。今回の対象はこのテストと本メモのみ。未コミットの作業があれば通常の手順で差分を照合する。
2. GitHub Actionsは対象headの `ci` と必須の `test` を見る。過去の赤いrunが履歴に残っていても、最新headの結果と区別する。
3. 今回はCIの競合修正であり、EG09・EG10全体の完了、正式切替、実機確認の完了を意味しない。残る実機・翻訳・受入範囲は [EG10の確認記録](../../qa/expanded-gameplay-evidence.md) を参照する。
4. C01〜C05と [SHK-20261106-CLAUDE-004の4点](../to-chatgpt/2026-11-06-1700-claude-expanded-judgement-calls.md) は引き続き利用者判断待ち。公開用の既定は `official-v1`、試作は内部ビルド `expanded-proposed` のまま。CI成功を承認やマージと扱わない。

この文書の反映をClaudeの起動・ACKと扱わない。受領時に案件IDと読んだSHAを返してほしい。
