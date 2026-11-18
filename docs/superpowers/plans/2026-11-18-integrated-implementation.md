# シャテッキ　36枠版を仕上げる実装計画書

> 実装担当はChatGPT。以下のチェック欄は、実装・試験を行い、対象コミットと結果を記録してから更新する。実行単位はS00〜S10とする。

**目標**　プレイヤーが一射で何を獲得し、弾が何発増えたかを見て理解でき、保存の失敗・再開・端末の向きの変化をまたいでも同じ記録が残る36枠版を仕上げる。

**対象**　基準main `01ab59242c6ec627e0e5fcb72706c563e6a39c2c`。仕様・物理・保存・見た目・UI・音・翻訳・統合・PR後の修正をChatGPTが行う。利用者は実機での観察に協力できる場合に結果を提供し、採用・公開・マージを判断する。

**構成**　既存のTypeScript、Three.js、Rapier、Vitest、PlaywrightとNode 22以上を使う。公開用と内部版をビルド時に選び、確定保存の通知を画面と音が読む。仕様は[統合要件仕様書](../../changes/2026-11-18-integrated-requirements.md)。保存の型・処理順、品替えの式、時計、素材配信の詳細は[PR #24の技術設計 §2〜§3](2026-11-14-post-pr23-completion.md)を引き継ぐ。担当、演出の組み込み先、翻訳の順は本書を使う。

## 全工程の条件

- 9枠正式版、内部r001（36枠）、r002（A1・A5）、r003（A1〜A10）を比較用に保つ。新しい回はルール版ごとに別の保存先を使う。既存の100景品・3景品100組、2景品300組、200問×2択、20シリーズ、36マス・100効果と補給10種の件数を照合する。
- 初期10発＋追加累計10発、最大20射。すべての効果を適用した後に終了を決める。表示・音から判定や得点を書き換えない。旧ベスト・図鑑・設定・識別値・送信待ちは保護し、ランキング通信と新しい送信待ちは0件とする。
- 見た目の変更は、既存の版・設定・画面サイズ・開始条件を記録した同じ場面で前後を比べる。翻訳用の文言識別子と引数は先に作り、15言語の最終訳はゲームと画面の文面がそろった時点でChatGPTがまとめる。
- 作業は専用ブランチとPRで進める。試験は変更が届く範囲だけを選び、共通の型・保存・精算の変更では既存の全経路を通す。同じコミットの成功済み試験を重ねて実行しない。対象の試験件数0・省略のみを合格にしない。

**重点的に反例を当てる箇所**　①保存成功の応答だけが失われた射（S01・S02）、②別タブが進行中の回を読み、確定後に結果を閉じる操作（S01・S02）、③幅の異なる景品に変わった後の揺れ・復帰（S03）、④初射の会心と、最終弾の初発見・補給が重なる場面（S04・S06）、⑤日付をまたぐ停止と再開（S05）。

## 依存関係と提出単位

| 実装PRの目安 | 着手と統合の条件 | 完成したときに確かめられるもの |
|---|---|---|
| A　保存 | S00→S01→S02 | r004でホーム→一射→結果→再プレイ。保存失敗・再試行・2タブの勝敗も同じ入口で試せる。 |
| B　品替え | S00後に幾何計算と試験を準備。Aの反映後にr005を登録して統合 | 支持位置、揺れる景品と復帰時の一致 |
| C　演出と装置 | S00後に静止画・画面案と比較条件を準備。S02の確定通知後に部品と試験を作り、S06でr006の通常画面へ接続 | P1〜P5と5装置の比較、音量0・省略時の画面 |
| D　日替わりと通し確認 | S02後にS05の時計を作る。Bのr005を基にr006を登録し、S02〜S05がそろったらS06で実画面を通す | 一射の再現結果、演出統合、44条件の更新 |
| E　実機・翻訳・比較 | 試験表と比較用の24条件は先に準備。統合後にS07・S08を進める | iPhone・15言語・試遊結果、C01〜C05の採用候補 |
| F　正式切替 | S09は実測と採用判断の後。S10の資料更新は各PRに含める | 正式版の配信確認と旧版へ戻す手順 |

統合担当もChatGPTとし、特に `src/app.ts`・共有型・ビルドと自動試験の定義を同時に別案で編集しない。各PRに基準・変更範囲・試験結果・次へ渡す条件を記す。PRの失敗や競合はChatGPTが修正し、利用者がマージする。

## S00　内部版の入口と比較対象を固定する

既存の[ビルド入口](../../../src/app/bundle.ts)、[試作の設定](../../../src/catalog/gameplay-config.ts)、[版ごとの起動設定](../../../package.json)を使う。新規設定は `data/expansion-v2/next-profile.json`。以下は今回の計画で追加する版である。

| 版とビルド指定 | 保存・品替え・時計 | 試験用出力／ポート／保管名 |
|---|---|---|
| r004 ／ `expanded-save-trial` | 一括保存・中心固定・従来の時計 | `dist-save-trial` ／ 4176 ／ `internal-save-trial-dist` |
| r005 ／ `expanded-placement-trial` | 一括保存・支持した底を保持・従来の時計 | `dist-placement-trial` ／ 4177 ／ `internal-placement-trial-dist` |
| r006 ／ `expanded-next` | 一括保存・支持した底を保持・固定刻みの時計 | `dist-next` ／ 4178 ／ `internal-next-dist` |

- [ ] 現行 `official-v1`・r001・r002・r003の件数・ルール版・公開時の入口を保存する。r004が選べず失敗する試験を書き、`src/contracts/expansion.ts` と `getGameplayBundle`、起動入口、実行コマンドを順に追加する。r005はS03、r006はS05で登録する。
- [ ] 各版を加えるPRで `playwright.config.ts` と `.github/workflows/ci.yml` の組立・保管・取得をそろえる。指定した内部ポートで版を識別でき、通常起動は9枠、URLや旧保存値で内部版に変わらないことを確認する。
- [ ] `npm run test:unit -- tests/unit/app-bundle.test.ts tests/unit/gameplay-bundle.test.ts`（後者は新規）、`npm run typecheck`、`node --test tests/ci/plan.test.mjs tests/ci/browser-env.test.mjs`。公開用 `npm run build` と該当する `build:save-trial` 等を実行し、版・成果物・試験件数を残す。

## S01　端末内の保存を一括で確定する（R01〜R05）

新規 `src/contracts/persistence.ts`、`src/persistence/indexed-run-repository.ts`、`src/persistence/legacy-import.ts` に、[技術設計 §2.2](2026-11-14-post-pr23-completion.md)の `RunRepository` を実装する。開始・発射・一射確定と結果閲覧を扱い、旧版用の同期保存は `src/persistence/run-store.ts` に残す。

- [ ] 新規 `tests/integration/atomic-persistence.test.ts` と `tests/e2e/atomic-persistence.spec.ts` で、同じ操作の二重受付、応答消失、書込み中断、別タブの割込みを先に再現する。ブラウザの同一サイト・同一利用環境で2ページを開く。
- [ ] 端末の複数記録を一度に保存できる仕組み（IndexedDB）を使う。操作IDと内容の一致を先に照合し、実行済みなら現在の最新記録を読む。既存の操作番号での再読は新しい成功通知を出さない。新規操作は版・回・更新番号・所有者・所有世代・進行段階を確認し、全書込みが完了したときだけ成功を返す。別の回に切り替わった場合や内容違いは拒否する。
- [ ] 旧記録は生の値を読んで解析し、読取り時に修復・隔離を書き戻す `src/persistence/profile-versions.ts` の経路を使わない。図鑑取り込みと取り込み履歴を同時確定し、記録なしプレイでは取り込み自体を行わない。共用おみやげ3枠は回の所有世代と独立した `slotRevision` を照合する。回の確定結果と獲得種類を同じ処理で読み、中断・獲得なし・記録なしからの追加を拒む。別タブで満杯の棚が更新されたら、最新の3枠を見せ、選び直せるようにする。
- [ ] `npm run test:integration -- tests/integration/atomic-persistence.test.ts` と `npx playwright test tests/e2e/atomic-persistence.spec.ts`。Nodeは差分・所有条件を試し、実際の端末内DBの取消・再読込と同時書込みはブラウザで試す。中断書込みは部分更新0、競合は勝者1、読取りだけの副作用0。

## S02　ゲームの操作と結果を保存に接続する（R01〜R05）

[操作・発射](../../../src/app/controller.ts)と[画面からの呼出し](../../../src/app.ts)を調べる。現行の `onShotFired` は保存の戻り値を待たず、終了結果・図鑑・ベストは別々に保存している。新規 `src/app/persisted-session.ts` に版ごとの非同期入口を置く。

- [ ] 新版では `dispatchPersisted(input: unknown): Promise<'applied' | 'rejected' | 'retryable' | 'conflict'>` に通す。主操作・全体図・注文・質問・再開の各ハンドラを点検する。同期の真偽値を期待する既存の画面には処理中の表示と完了通知を接続し、Promiseの真偽で受付済みにしない。従来版には従来の入口を使う。
- [ ] 発射は候補計算→保存成功→状態の採用→飛行・発射音。精算は候補結果を保存→棚・確定通知・画面／音。実際の失敗では飛行・音とも0回、同じ画面の同じ操作番号・候補での再試行が初めて成功すれば各1回。書込み済みで応答だけ失った場合は、最新の状態を読んで静止表示する。飛行も音も再開しない。保存済みの発射が飛行途中なら現行の中断規則で解決し、未精算の再読込を精算成功に変えない。精算失敗なら候補を画面内で保持し、物理・抽選を再実行せず保存だけを再試行する。待ち時間は時計・照準・装填を止め、主操作・回答・押しっぱなしの再送を捨てる。非表示・横向きなら保存が終わっても進行を止め、表示を戻しただけで発射しない。
- [ ] 「再試行」は同じ操作番号、「この画面だけで遊ぶ」は新しい回にする。端末設定は読み、回の確定通知はメモリ内で各1回だけ発行する。終了や再読込後も記録・棚・取り込み済み印・隔離記録への書込みは0件。結果の再表示・図鑑から戻る操作は読取りだけ。終了・中断後は別画面からも現行番号を照合して結果を閉じ、新規開始できる。生きている回・競合した古い操作からは閉じられない。
- [ ] 新規 `tests/integration/persisted-controller.test.ts` と `tests/e2e/persisted-gameplay.spec.ts` で初射、最終射、約0.9秒の結果切替前後、記録なしプレイを通す。発射の実失敗→成功と、書込み済み→応答消失→再読を別に試す。精算失敗→再試行と、別画面が先の終了・所有者変更も確認する。精算・結果再読込で得点、図鑑、音の二重更新0。実行は `npm run test:integration -- tests/integration/persisted-controller.test.ts` と `npx playwright test tests/e2e/persisted-gameplay.spec.ts tests/e2e/rewards.spec.ts`。

## S03　棚を支点に品替えする（R06・R11）

- [ ] 新規 `src/sim/transform-placement.ts` の `candidateTransformPose` と `src/sim/transform-plan.ts` に、回転を含む外接箱の底と支持面の検査を追加する。棚との水平範囲と下端の許容差0.01mを使う。支持不明・落下中は元の姿勢、候補が上棚・隣の全運動範囲と重なる場合は延期する。
- [ ] `src/sim/world.ts`・`src/sim/motion.ts`・`src/contracts/game.ts`・`src/view/prizes.ts` で、同じ決定後の姿勢を物理・表示・保存に渡す。旧運動の種類・位相と新品種の形を区別し、揺れ一周期の最大幅、復帰時の基準姿勢、塞がった枠をすべての景品で判定する。新規補充だけ新しい動きにする。現行の `src/core/expanded-settlement.ts` の `refillCatalog` はシリーズ外の種類を除き、`src/core/replenish.ts` の `isSlotBlocked` は種類が見つからない景品を飛ばす。r005以降の補充には全カタログを渡し、抽選だけを既存の `candidateTypeIds` で絞る。別シリーズの景品が残れば補充を延期し、空いてから1回補充する。
- [ ] r005をS00の手順で登録する。`npm run test:unit -- tests/unit/expanded-transforms.test.ts`、`npm run test:integration -- tests/integration/transform-bottom.test.ts tests/integration/expanded-layout-world.test.ts`（`transform-bottom.test.ts` は新規）。高さ・幅違い、傾き、異周期、再開、候補が全て入らない例で一致・延期を確認し、旧版の中心固定も回帰確認する。

## S04　屋台・補給装置・画面・演出・音を制作する（R07・R08・R15）

ChatGPTが[屋台の見た目](../../design/visual-direction.md)、[既存の装置](../../../src/view/reward-props.ts)、[報酬の札](../../../src/ui/reward-panel.ts)、[音](../../../src/audio/engine.ts)を使う。先にr003でホーム・位置選び・質問・結果の同じ場面を撮影する。部品の比較はS02以降、通常のプレイからの初回統合はS06のr006、その後は採用候補と正式版でも確認する。

- [ ] `src/contracts/persistence.ts` に技術設計 §2.4の `ConfirmedPresentation` を定義する。精算通知には `runId/shotId`、保存済み `ShotSummary` と図鑑の新規差分、会心通知は `STOP_LOAD` が初めて成功した場合にだけ `runId/operationId`、射番号、確定した `LoadResult` から作る。初射には前射の要約を要求しない。保存済みの発射前残弾で「最後の1発」を判定できるようにする。再読込の `replayed` は静止した内容だけを表示する。精算は `runId/shotId`、装填は `runId/operationId` で重複を防ぐ。記録なしプレイでは同じ通知をメモリ内の確定から出す。
- [ ] 新規 `src/view/reward-motions.ts` に `presentRewardMotion(input: ConfirmedPresentation): void` と破棄処理を用意する。P1は小札→袋、P2は絵・組名・初発見印、P3は実増加コルク→弾入れ、P4は適用／延期／次射予約、P5は装填確定の金具。札・音・動きが、同じ一射には既存 `shotMoment` の同じ優先結果を使う。`src/app.ts` の既存 `playCommandCue` の `critLatch` / `loadStop` と同じ装填に音を一度だけ割り当てる。
- [ ] 現在の `rewardCardModel` は成立組を名前と初発見印だけにしている。`setId` を残し、`catalog.sets.get(setId).requiredTypeIds` から2〜3個の確定メンバーを並べる。図鑑と同じ組名、各種の訳名と景品絵を使う。絵は既存の100景品の造形から事前に静止画像をまとめ、種類IDで1枚を選ぶ。札ごとの3D描画を作らない。通常成立・初発見・複数同時で絵の種類と個数を照合する。
- [ ] `src/view/reward-props.ts` と `src/view/gameplay-hints.ts`、`src/ui/effect-results.ts`、`src/ui/expanded.css`、`src/audio/sounds.ts` を接続する。袋は初期の指定個体、風鈴は反射時のみ、シーソーは受け皿、貯金箱は投入口、最後の的は外周と中心を読める形にする。物理側の配置で通常・使用後・進捗を描き、画面から有効範囲を広げない。当たり判定・位置・配点を変える場合はr007以降の未使用の番号を割り付け、S06〜S08のうち影響する画面試験、実機の視認・命中、比較を新しい版で取り直す。
- [ ] `pointer-events: none` は演出の飾りだけに適用し、質問・注文・閉じるボタンは指で操作できるようにする。新規 `tests/unit/reward-motions.test.ts` と `tests/e2e/reward-motions.spec.ts` に、初射会心、再描画、初発見＋残り1から続行、上限＋0、無音・省略・動きを減らす例を用意する。動かしても得点・入力可能時刻は同じ。60回の場面切替後に演出要素、音源とタイマーが残らない。
- [ ] `npm run test:unit -- tests/unit/reward-motions.test.ts tests/unit/reward-panel.test.ts tests/unit/audio.test.ts`。S06では `npx playwright test tests/e2e/reward-motions.spec.ts` を対象版に向けて実行する。3画面寸法の画像、音ありの短い動画または試聴記録を、対象コミット・設定と結び付ける。

## S05　日替わりの時計をそろえる（R09・R10）

- [ ] `src/core/daily.ts`・`src/core/expanded-run.ts` と新規 `src/core/game-clock.ts` に、開始日とルール版を固定した時計を接続する。`FixedGameClock.advance(rawDtSec, paused)` は既存 `tuning.limits.fixedStepSec` を使う。装填・照準・棚の周期・物理を同じ刻みで1回ずつ進め、旧フレーム用の加算や上限処理を重ねない。
- [ ] ゲーム内の刻み番号と同刻み内の順で入力を適用する。質問だけが時間を止めている間は回答を1回受け付ける。手動停止・横向き・非表示・保存待ちの間は回答を拒む。縦に戻して明示的に再開したら、保存待ちの解消後に同じ質問へ1回答できる。これらの待ち時間を次の刻みへ加えない。開始日の保存と進行中の回への参照により、翌日に前日の回を選び直せるようにする。
- [ ] r006をS00の手順で登録する。新規 `tests/integration/daily-determinism.test.ts`、`tests/e2e/daily-next.spec.ts` で、異なる回ID、ja/en/th、描画間隔1/60・1/30・0.1秒、23:59開始→翌00:01再開を比較する。各射の景品・得点・残弾・質問・抽選状態が一致し、通常記録に書込みがない。横向き中の回答・二本指での操作→縦復帰→再開→同じ質問に1回答の順も試す。実行は `npm run test:integration -- tests/integration/daily-determinism.test.ts` と `npx playwright test tests/e2e/daily-next.spec.ts`。

## S06　開始から結果まで通して確認する（R07〜R13）

- [ ] S04の部品を `src/app.ts`・`src/app/expanded-ui.ts` に組み込む。表示方式をビルド設定に持たせ、旧版〜r003は従来、r004/r005は二重発音を防ぐ確定通知と従来の見た目、r006以降の候補は確定通知と新しい演出を選ぶ。文字列 `r006` と一致する場合だけに演出を閉じ込めず、S09で実測済みの候補設定を正式版も選べるようにする。主操作→実際の飛行→質問／落下→精算→保存→表示・音→結果→再プレイを通す。画面を描いただけで次の射の状態が進まないことを確認する。
- [ ] 新規 `tests/integration/next-acceptance.test.ts` と既存 `tests/integration/expanded-acceptance.test.ts`・`tests/unit/transform-grace.test.ts` に、不成立と成立を含む固定入力を追加する。延期中の別シリーズ景品が枠を塞ぐ、落下猶予が1回で終わる、2・3景品同時成立、最終弾で補給成功／不成立、旧記録不変・送信0を通す。店主の部位または隠し的だけに初命中した射で所定の初回点を計上し、次射・結果の再読込では重ねない。試験用に精算後の値を直接注入して合格にしない。
- [ ] `npm run test:integration -- tests/integration/next-acceptance.test.ts tests/integration/expanded-acceptance.test.ts tests/integration/expanded-checkpoint.test.ts`、`npm run test:unit -- tests/unit/transform-grace.test.ts`、S04の画面試験を各対象の版で実行する。UI・音・翻訳だけの変更でも対象の候補版の新しい試験（長文、報酬札、既存の言語試験を該当範囲で実行）を選ぶよう `scripts/ci/plan.mjs` と `tests/ci/plan.test.mjs` を更新する。
- [ ] `docs/qa/post-pr23-evidence.md`（新規）に、決定01〜37とR01〜R22を、36枠のAC01〜45・CH-AC01〜44の各行に対応付ける。対象版・コミット・試験名・実測者・結果・未確認条件を入れ、適用外の理由も残す。9枠は採用済みrules-v1の条件を使い、AC01の36枠・AC02の2景品300組を課さない。AC04の複数指・指離し／AC34のX共有（確定点・正式URL・本人操作、開けない場合のコピー／手動コピー）を実画面で確認する。非公開のランキングは表示・送信0を試し、順位集計は適用外とする。過去の31件／13件を現在値にしない。

## S07　確認ページ、iPhone、15言語（R14〜R16・R19）

- [ ] `playwright.config.ts` に402×700を追加し、402×874・375×600も使う。既存 `tests/e2e/long-text.spec.ts` が使う9枠の4173を残す。候補（r006は4178）に新規 `tests/e2e/next-long-text.spec.ts` と `tests/e2e/reward-motions.spec.ts` を向ける。画面に出た版・選択言語を読み取ってから、主操作に重なる札、長い2択が下に切れる例、閉じた質問の透明層がタップを奪う例を検査する。横→縦・一時停止・再読込・音量0でも確認する。
- [ ] 文面が固まったらChatGPTが `src/i18n/locales/` と `src/i18n/expanded/` を15言語で照合し、追加の保存案内、効果・終了理由、共有文の変数・数・増減方向を点検する。候補の各15言語・3画面寸法で、ホーム、最長の質問・両回答、セット・効果札、保存失敗、終了理由・結果・共有を開く。切れ・重なり・代用した英語を検出し、スクロールを含め最後の選択肢・再試行・再プレイまでタップできることを確かめる。言語ごとの辞書検査も行う。人が読んだ言語・範囲も記録する。
- [ ] 確認ページは既存Pagesの `/shatekki/preview/<候補のrulesVersion>/`。r006を試す場合は `/shatekki/preview/rules-v2-proposed-r006/` を使う。候補・コミット・設定・URLを一組で記録する。新規 `scripts/release/prepare-next-preview.mjs` と `.github/workflows/preview-next.yml` の準備PRで、同一mainの9枠正式版をルートに、下位パス専用に組み立てた候補を確認先に置いた成果物を作る。配信前に両方の直リンク・素材・再読込と版を試す。URLを知る人が開ける範囲、期間、費用条件、終了時に最新正式版だけへ戻す方法を示し、利用者の公開判断後に配信する。通常配信と同じ排他制御・直前のmain照合を使う。実機では確認用の独立したSafariプロファイルから、9枠の正式URLで比較用の回を作る。同じサイトの確認ページに限り、試験用のr003キーが未使用であることを確認してから実物由来のr003保存例を入れる確認操作と、旧キーの比較表示を用意する。候補で一射・終了後に旧キー・ベスト・図鑑・送信待ちを照合し、9枠の正式URLを再読込して旧記録を確認する。r003そのものの再開は、自動試験用の同一オリジンに9枠・r003・候補を別パスで置いて確かめる。確認用の操作は正式版ビルドに含めず、既存の利用者データを上書きしない。確認ページ撤収時は正式版の実URLと記録を再確認する。
- [ ] iPhone 17 Pro Safariで縦／短い表示／横向き停止・縦復帰、アプリ切替、質問・保存中の再読込、両端と上下段・5装置、音オン／オフ・0・復帰を確認する。36景品・36マス・最大8コルクの飛行中と、多獲得・初発見・複数札の精算後を別々に測る。短い場面は同じ条件で繰り返し、各場面の累計60秒以上と連続3ゲームで表示寸法、コマ間隔・毎秒のコマ数、発熱・音切れ、OS/Safari、日時・候補版・コミット・画像を残す。目標60、下限30コマ。下限未達は原因・修正→同じ場面の再測定とし、未測定・未達の条件をS09の合格にしない。
- [ ] 新規 `docs/qa/post-pr23-iphone.md` と `docs/qa/post-pr23-locales.md` に観察者・実際の結果を記録する。確認ページの公開や実機が待ちの場合もS08の自動比較を進め、実機未測定の項目を明示する。

## S08　同じ条件で比較し、採用候補を作る（R17・R18）

- [ ] 既存 `tests/integration/expanded-balance-probe.test.ts` の24種 `(i+1)*7919, i=0..23` と打ち手の方針を使い、新規 `tests/integration/next-balance-probe.test.ts` で `official-v1`・r001〜r006の7版を比べる。候補がr007以降ならそれも同じ24条件で追加比較する。未搭載の機能は「対象外」とし、成立率0と区別する。
- [ ] 版ごとに発射数、所要時間、獲得数、2・3景品セット、補給元の試行・成立・提示数・実増加・上限、区画、延期理由を記録する。別に「景品を狙う」「補給を狙う」で、人の試遊者数・版・回数と結果を残す。
- [ ] `npm run test:integration -- tests/integration/expanded-balance-probe.test.ts tests/integration/next-balance-probe.test.ts`。弾数が整合し有限時間で終了することと、試遊による遊びやすさを別々に判定する。新規 `docs/qa/post-pr23-balance.md`、`docs/release/expanded-adoption.md` へC01〜C05それぞれの現値・候補・根拠・利用者の採用状況を記録する。変更した設定は新しい内部版で固定して比較する。配置・当たり・配点に変更があれば新候補の版・コミット・設定を採用表に記録し、S06〜S08の影響項目を同じ新候補で測る。古い版の実測結果はその版の列に残す。

## S09　利用者が採用した36枠版を別PRで切り替える（R20・R21）

- [ ] S01〜S08の証拠を集め、実機・試遊・15言語の各結果、採用値、対象URL、戻し方を示す。採用候補の版・コミット・設定内容を実測記録と突き合わせる。実機未測定、性能下限未達、変更後の再確認待ちは該当工程へ戻す。利用者の採用・公開判断を得たら `data/release-approved-v2.json` と `docs/release/official-v2.md` を新規に作り、`src/catalog/release-config.ts` と `src/app/bundle.ts` に、独立した正式ルール番号と保存先を登録する。
- [ ] 正式設定は、採用した候補と保存の方式・底の保持・時計・補給・確定後の演出を一致させ、識別子と保存先を正式用に分ける。公開用ビルドの通常入口で36枠、補給10種、初射のP5・P1〜P4・5装置・音・15言語を試す。旧版は9枠と旧設定のまま起動することを照合し、36枠専用の補給10種は旧版の対象外と記録する。両版とも試作スコア混入0、名前欄・ランキング表示なし、ランキング通信・新規送信待ち0。各版の保存先が正しく分かれることも試す。
- [ ] 利用者のマージ後に最新main・自動試験の成功コミット・同じ実行の `site-dist` と配信処理を照合する。本番URLで開始→一射→結果→再プレイ、音、保存復帰、X共有先を確かめる。配信失敗や見た目の重大な崩れはChatGPTが調べ、必要なら9枠版を既定に戻すPRを用意する。両版の記録を残す。

## S10　課題・資料・証拠を更新する（R22）

- [ ] 各実装PRでREADME、[後続対応表](../../release/follow-up-status.md)、[作業台帳](../../architecture/task-ledger.md)、[未確定事項](../../open-items.md)の該当項目を更新し、状態と証拠を同じ行に置く。初版の案・過去の作者表記・過去の測定値は履歴として残す。
- [ ] Issue [#1](https://github.com/chameleonjp-lab/shatekki/issues/1)・[#2](https://github.com/chameleonjp-lab/shatekki/issues/2)は初期の要件保管場所。ファイル化済みの参照先を対応付ける。品替えの底以外の旧判断3件（候補順固定、FX090の向き、分裂角倍率0.75〜1.5）もC03の実装と照合する。
- [ ] 結果表に `対象版・コミット／要件番号／期待／実際／自動・実機・試遊の別／証拠／残件` を残す。文書の点検、ゲームの実装、実機観察、正式値の採用、配信の段階をそれぞれ記録する。
