# 追加要件と実装計画の対応表

作成日：2026-11-06。基準 main：`44b420467738f1f1ad5a72211260a6a05f52ca43`。

[追加実装計画](../superpowers/plans/2026-11-06-expanded-gameplay.md)の EG01〜EG10 と、[要件修正書](../changes/2026-11-06-expanded-gameplay-requirements.md)の CH-AC01〜44 を対応付ける。主担当工程は、その確認条件の成立をまとめる工程を示す。関連工程の試験・画面・保存結果も証拠として使う。

**本表は実装前の確認計画であり、全44項目の状態は未実施である。** 表中の `expansion-catalog`、`pair-sets`、`expanded-*`、`background-cells`、`shopkeeper-*`、`gameplay-effects`、`shot-effect-plan`、`profile-versions` の試験ファイルは新規作成予定である。既存の `draw.test.ts`、`replenish.test.ts`、`security.test.ts` などは拡張・再確認する予定を示す。ファイル名を記載したこと、候補表を数えたこと、旧版の試験が成功したことを、新要件の実行済み・合格とは扱わない。

## 1. 工程の対応

| 工程 | 担当する内容 |
|---|---|
| EG01 | 契約・候補データ・共通実行設定 |
| EG02 | セット判定・加点 |
| EG03 | 36枠・背景接触・補充 |
| EG04 | 質問・100効果の計算 |
| EG05 | 飛行後停止・変化・一射確定 |
| EG06 | 保存・ルール版ごとの自己ベスト |
| EG07 | 棚・全体図・縁表示 |
| EG08 | 質問入力・起点接続 |
| EG09 | 図鑑・15言語・音 |
| EG10 | 統合測定・正式切替PRの準備 |

## 2. CH-AC01〜44の確認計画

| ID | 主担当工程 | 主な試験・証拠 | 合格条件 | 状態 |
|---|---|---|---|---|
| CH-AC01 | EG03 | `tests/unit/expanded-layout.test.ts`、`tests/e2e/expanded-gameplay.spec.ts` | 新規ゲームが縦3段・横12列の36個で始まり、36枠の番号が重複しない。 | 未実施 |
| CH-AC02 | EG03 | `tests/unit/expanded-layout.test.ts`、`tests/integration/expanded-view-contract.test.ts`、iPhone操作記録 | 棚・壁・回収面・有効範囲・描画の位置が一致し、左右端と上下段を狙える。 | 未実施 |
| CH-AC03 | EG07 | `tests/e2e/expanded-gameplay.spec.ts`、iPhone縦画面の操作記録 | 位置移動と照準を混同せず操作でき、全体図の操作から発射や効果が発生しない。 | 未実施 |
| CH-AC04 | EG03 | `tests/integration/expanded-shot.test.ts`、`tests/integration/expanded-view-contract.test.ts` | 同じ初期状態・射を異なる視点で処理しても、画面外を含む衝突・獲得・効果・確定結果が一致する。 | 未実施 |
| CH-AC05 | EG03 | `tests/unit/replenish.test.ts`、`tests/unit/draw.test.ts`、`tests/unit/expanded-layout.test.ts` | 36枠全体を補充対象とし、塞がった枠は延期する。未獲得景品の削除・強制移動で空きを作らない。 | 未実施 |
| CH-AC06 | EG01 | `tests/unit/expansion-catalog.test.ts` | PAIR001〜PAIR300が300件あり、各組は実在する異なる2種類を参照する。順序を無視した重複がなく、全100種類を参照する。 | 未実施 |
| CH-AC07 | EG01 | `tests/unit/expansion-catalog.test.ts`、`tests/unit/pair-sets.test.ts`、図鑑の表示記録 | 既存S001〜S100を維持し、採用した構成に従って2種類300組と3種類100組を識別・表示できる。旧番号を流用しない。 | 未実施 |
| CH-AC08 | EG02 | `tests/unit/pair-sets.test.ts` | 異なる2種類を別々の射で取っても順序によらず成立し、同じ種類の2個では成立しない。 | 未実施 |
| CH-AC09 | EG02 | `tests/unit/pair-sets.test.ts`、`tests/integration/expanded-acceptance.test.ts` | 同じ獲得種類が複数セットへ寄与し、2種類・3種類が同時成立しても、各セットの加点は一ゲーム1回だけとなる。 | 未実施 |
| CH-AC10 | EG06 | `tests/unit/pair-sets.test.ts`、`tests/integration/expanded-checkpoint.test.ts` | 新規ゲームではゲーム内の成立状態を戻し、旧S001〜S100を含む図鑑の発見状態は保持する。 | 未実施 |
| CH-AC11 | EG01 | `tests/unit/expansion-catalog.test.ts`、`tests/unit/shopkeeper-questions.test.ts` | Q001〜Q200が200件で各2択。効果グループの参照漏れがなく、各A/Bの登録候補集合が異なる。状態による有効候補の減少とは分けて検査する。 | 未実施 |
| CH-AC12 | EG05 | `tests/unit/shopkeeper-questions.test.ts`、`tests/integration/expanded-shot.test.ts` | 元弾・分裂弾・反射・複数部位の店主命中を一射1問へまとめる。別の射での命中では出題できる。 | 未実施 |
| CH-AC13 | EG04 | `tests/unit/shopkeeper-questions.test.ts` | ゲーム開始時に200問を並べ替えた抽選袋を作り、同一ゲーム内で重複しない。新規ゲームでは新たな抽選順を作る。 | 未実施 |
| CH-AC14 | EG05 | `tests/integration/expanded-shot.test.ts`、`tests/e2e/expanded-gameplay.spec.ts` | 全コルクの飛行終了前は質問を表示しない。質問中は弾・景品・周期運動・ゲーム内時間・落下猶予を進めない。 | 未実施 |
| CH-AC15 | EG08 | `tests/unit/shopkeeper-panel.test.ts`、`tests/unit/shot-effect-plan.test.ts`、`tests/e2e/expanded-reload.spec.ts` | 回答の二重タップ・再描画で抽選と適用要求を重複させない。効果は選んだグループだけから1件選ぶ。質問途中のページ再読込はCH-AC37の中断となり、再抽選しない。 | 未実施 |
| CH-AC16 | EG08 | `tests/unit/shopkeeper-panel.test.ts`、`tests/e2e/expanded-gameplay.spec.ts` | 回答の時間制限・自動回答がなく、演出省略でもA/Bの回答が必要。ホームへ戻る等の途中終了は中断となる。 | 未実施 |
| CH-AC17 | EG04 | `tests/unit/shopkeeper-questions.test.ts`、`tests/integration/expanded-shot.test.ts` | 店主の部位初回加点と質問回数を独立して扱い、再出題しただけで部位点を再加算しない。 | 未実施 |
| CH-AC18 | EG01 | `tests/unit/expansion-catalog.test.ts`、`tests/unit/pair-sets.test.ts` | SER01〜SER20の所属景品が実在し、シリーズ所属・縁表示だけではセット成立や加点を起こさない。 | 未実施 |
| CH-AC19 | EG04 | `tests/unit/expansion-catalog.test.ts`、`tests/unit/gameplay-effects.test.ts` | FX001〜FX100が100件あり、対象・発動時点・終了条件・再付与/上書き・上限・適用不能条件を定義し、その条件どおりに処理できる。 | 未実施 |
| CH-AC20 | EG03 | `tests/unit/background-cells.test.ts`、`tests/integration/expanded-checkpoint.test.ts` | 36マスへ各1件を割り当て、同じ効果の別マスへの割当も許す。射撃間の復元で割当が変わらず、途中の再読込で引き直せない。 | 未実施 |
| CH-AC21 | EG03 | `tests/unit/background-cells.test.ts`、`tests/integration/expanded-shot.test.ts` | コルクが背景面へ実際に接触した場合だけ発動し、景品越しの押下や景品の接触では発動しない。 | 未実施 |
| CH-AC22 | EG03 | `tests/unit/background-cells.test.ts`、`tests/integration/expanded-shot.test.ts` | 境界の同一接触が選ぶマスは1個。元弾・分裂弾の同時接触でも各マス一ゲーム1回を守る。 | 未実施 |
| CH-AC23 | EG03 | `tests/unit/background-cells.test.ts`、`tests/integration/expanded-checkpoint.test.ts`、`tests/e2e/expanded-gameplay.spec.ts` | 補充・品揃え変更・視点移動・後の射で使用済みを戻さず、使用済みマスでも通常反射は残る。 | 未実施 |
| CH-AC24 | EG04 | `tests/unit/gameplay-effects.test.ts`、`tests/unit/shot-effect-plan.test.ts`、`tests/e2e/expanded-gameplay.spec.ts` | 上限到達・対象なしでも背景の割当効果を引き直さず、理由と使用済みを表示する。質問の有効候補が0件でも別グループへ変更しない。 | 未実施 |
| CH-AC25 | EG04 | `tests/unit/gameplay-effects.test.ts`、`tests/unit/shot-effect-plan.test.ts`、`tests/integration/expanded-shot.test.ts` | 旧装置・背景・回答で追加累計10発を共有し、減少後も累計を減らさず最大20射。残弾0への減少処理で1発を生み出さない。 | 未実施 |
| CH-AC26 | EG05 | `tests/integration/expanded-shot.test.ts`、`tests/integration/expanded-acceptance.test.ts` | 最後の射の回答で上限内の追加弾を得たら続行し、先行する背景の次射効果も保持する。追加枠がなければ説明して終了する。 | 未実施 |
| CH-AC27 | EG04 | `tests/unit/gameplay-effects.test.ts`、`tests/unit/shot-effect-plan.test.ts`、`tests/integration/expanded-shot.test.ts` | 次射設定をその元弾と分裂弾へ引き継ぐ。終了時に消費した旧設定だけを解除し、その射で得た新予約は残す。同一項目は後勝ちで有限となる。 | 未実施 |
| CH-AC28 | EG05 | `tests/unit/expanded-transforms.test.ts`、`tests/integration/expanded-shot.test.ts` | 品揃え変更は画面外を含む未獲得個体だけに適用し、個体番号・所属枠・位置・向き・速度・角速度・耐久率を引き継ぐ。変化だけで加点しない。 | 未実施 |
| CH-AC29 | EG05 | `tests/unit/expanded-transforms.test.ts`、`tests/integration/expanded-shot.test.ts` | 周期運動の固定状態と位相を維持し、外れた個体を台へ戻さない。新しい種類の周期運動は新規補充時から使う。 | 未実施 |
| CH-AC30 | EG05 | `tests/unit/expanded-transforms.test.ts`、`tests/integration/expanded-checkpoint.test.ts`、表示記録 | 形が重なる個体だけを延期し、固定した候補順で再確認する。獲得済みを戻さず、実際の変更時の現在耐久率を使い、旧種類が残る理由を表示する。 | 未実施 |
| CH-AC31 | EG05 | `tests/unit/expanded-transforms.test.ts`、`tests/unit/pair-sets.test.ts`、`tests/integration/expanded-shot.test.ts` | 同じ処理点での複数変化は最終種類へ一度だけ丸めて反映する。変化後の落下・獲得・セット成立を同じ一射へ含める。 | 未実施 |
| CH-AC32 | EG04 | `tests/unit/gameplay-effects.test.ts`、`tests/integration/expanded-checkpoint.test.ts` | 補充先のシリーズと縁表示のシリーズを別に保持し、各々の上書き・終了で他方を誤って変更しない。 | 未実施 |
| CH-AC33 | EG07 | `tests/integration/expanded-view-contract.test.ts`、`tests/e2e/expanded-gameplay.spec.ts`、実機画面記録 | 同シリーズへ同色の縁と共通記号を付け、シリーズ名も示す。補充・種類変更・画面外へ追従し、色だけで区別させない。 | 未実施 |
| CH-AC34 | EG05 | `tests/unit/shot-effect-plan.test.ts`、`tests/integration/expanded-shot.test.ts`、`tests/integration/expanded-checkpoint.test.ts` | 同時効果の順序・乱数・対象・候補順が保存/演出省略/描画速度で変わらない。質問前の仮計画を回答後に再抽選・再加算しない。 | 未実施 |
| CH-AC35 | EG05 | `tests/integration/expanded-shot.test.ts`、`tests/integration/expanded-acceptance.test.ts` | 一射の効果・変化・落下が終わるまで得点・セット・終了を確定せず、質問待ちを落下猶予へ加えたり猶予を再延長したりしない。 | 未実施 |
| CH-AC36 | EG06 | `tests/integration/expanded-checkpoint.test.ts`、`tests/e2e/expanded-reload.spec.ts` | 射撃間の復元で36枠、マス割当/使用済み、質問抽選順、乱数、次射設定、各シリーズ、延期変化を再現する。復元で再抽選しない。 | 未実施 |
| CH-AC37 | EG06 | `tests/integration/expanded-checkpoint.test.ts`、`tests/e2e/expanded-reload.spec.ts` | 質問待ち・回答処理途中でページが失われたらD27中断。再質問・無料の撃ち直し・終了結果送信をせず、過去の自己ベスト・図鑑を保持する。 | 未実施 |
| CH-AC38 | EG08 | `tests/e2e/expanded-gameplay.spec.ts`、`tests/e2e/expanded-reload.spec.ts`、iPhoneの切替/横向き記録 | ページを保持したアプリ切替・横向きから同じ質問/選択状態へ戻り、手動再開できる。時間飛躍・自動回答・誤射・音のまとめ鳴りがない。 | 未実施 |
| CH-AC39 | EG06 | `tests/integration/expanded-checkpoint.test.ts`、`tests/e2e/expanded-reload.spec.ts` | 保存失敗・退避失敗・複数タブの競合で旧保存を黙って上書きしない。回答要求/一射の再処理でも二重効果・二重加点を起こさない。 | 未実施 |
| CH-AC40 | EG06 | `tests/unit/profile-versions.test.ts`、`tests/integration/expanded-checkpoint.test.ts` | 旧ルールの自己ベスト・S001〜S100発見・名前・音/言語設定・送信待ちを保持し、新旧の自己ベストを混ぜない。旧途中経過を新ルールへ黙って変換しない。 | 未実施 |
| CH-AC41 | EG09 | `tests/unit/expanded-i18n.test.ts`、`tests/unit/expanded-audio.test.ts`、`tests/e2e/expanded-long-text.spec.ts`、文言レビュー記録 | 新しいセット/質問/選択肢/効果/シリーズ/理由表示を15言語で表示する。長い2択を操作でき、翻訳で参照先・数値・条件が変わらず、無音でも効果が分かる。 | 未実施 |
| CH-AC42 | EG10 | `tests/e2e/expanded-performance.spec.ts`、既存 `tests/integration/performance.test.ts` の拡張、性能記録・iPhone実機記録 | 36景品・36マス・最大分裂・縁表示・質問を含む負荷を測定する。環境・版・場面・時間を記録し、模擬画面とiPhone実機の証拠を分ける。 | 未実施 |
| CH-AC43 | EG10 | `tests/integration/expanded-acceptance.test.ts`、`tests/integration/expanded-shot.test.ts` | 最後の弾→複数マス→質問→シリーズ変更→落下→2種/3種同時成立を通し、各効果・個体・セット・終了を一度だけ確定する。演出省略でも一致する。 | 未実施 |
| CH-AC44 | EG10 | 既存 `tests/integration/security.test.ts`・`tests/integration/ranking.test.ts` の再確認、`tests/e2e/expanded-gameplay.spec.ts`、公開差分の確認記録 | ランキングの入力/表示と開始・終了・再送・取得通信を止め、実験場へ未連携のままとする。旧記録を保持し、新旧正式データ・公開設定を承認範囲外で変更しない。 | 未実施 |

## 3. 旧ACの読み替えと再確認

[既存の受入確認](../acceptance-criteria.md)を削除せず、[過去の実行証拠](../qa/acceptance-evidence.md)と今回の結果を分けて記録する。既存項目の状態を、計画作成だけで「合格」に変更しない。

| 旧AC | 今回の対応 |
|---|---|
| AC01・AC02・AC20 | 36枠、2種類300組、必要種類数ごとの成立へ読み替え、EG01〜EG03のCH-AC01・05〜09で確認する。 |
| AC11・AC17・AC18 | 補充延期、全発生源の追加上限、最後の弾をEG03〜EG05で確認する。CH-AC05・25〜27・35・43と対応する。 |
| AC25 | 店主の部位初回点と質問回数を分け、EG04・EG05・EG08のCH-AC12・15〜17で確認する。 |
| AC35・AC36・AC37 | 15言語・音・停止/復帰をEG08・EG09で再確認する。CH-AC14・38・41に加え、保存した音オフ/音量0・言語の優先も確認する。 |
| AC38・AC39・AC41 | 保存・中断・旧記録と秘密情報の保全をEG06・EG10で確認する。CH-AC36〜40・44と対応する。 |
| AC40・AC42〜AC45 | 性能、最後の弾の複合経路、旧装置の一射1回、変化、有限の落下猶予をEG03〜EG05・EG10で再確認する。CH-AC21〜23・28〜31・34・35・42・43と対応し、背景の一ゲーム1回と旧装置の一射1回を混同しない。 |

## 4. 性能・つり合い・実機の証拠

性能条件は[既存の性能記録](../qa/performance.md)を参照する。現行の実機目標はiPhone 17 ProのSafariで毎秒60コマを目指し、少なくとも毎秒30コマを保つこと。一射の物理処理上限は当時の設定で飛行4秒・静止待ち5秒・落下猶予1.2秒である。新しい質問の入力待ち時間には制限がないため、この合計10.2秒を入力待ち込みの一射へ当てはめない。設定を変更する場合は採否と測定条件を残す。

既存の自動性能試験は、Nodeの処理時間の95%点50ms未満、Chromiumのコマ間隔の中央値250ms未満という停止検出を含む。これらの成功だけではiPhoneで毎秒30コマ以上とは判定しない。36景品の測定を追加し、[iPhone実機手順](../qa/iphone-checklist.md)へ質問・全体図・縁・新しい長文を追補する。旧9景品の測定値は比較資料として残す。

`tests/integration/expanded-balance-probe.test.ts` は新規作成予定とし、旧版と新案で獲得種類数、2種/3種の成立数、得点内訳、質問回数、有利/不利/対象なしの回数、追加弾、総プレイ時間を同じ条件で測る。測定した回数と条件を示し、少数の試行を実際の成立確率や「必ず楽しくなる」という結論へ置き換えない。

## 5. 確認範囲と公開条件

[変更範囲に応じたCI](../qa/ci-scope.md)に従う。計画と対応表だけのMarkdown変更では、文書の整合・参照・判定規則を確認し、ゲーム全試験を繰り返さない。後続の共有型・物理・採点・保存・データ変更は既存規則どおり全体確認となる。言語/UI/音の対象試験には、今回追加する該当試験も選ばれるよう対応を登録する。成功0件やskipだけを合格にせず、同じ差分で成功した全体確認を理由なく手動反復しない。

ランキング非公開・実験場未連携は[正式公開の条件](../release/official-v1.md)を引き継ぐ。ゲーム本体の公開状態とランキングの非公開状態を分けて確認する。[現行Pages定義](../../.github/workflows/pages.yml)は、成功した同一mainのCI成果物を再利用する。計画作成・PR提出を公開完了とは扱わず、公開URLの到達と外部設定は未確認のまま記録する。EG10は正式切替PRをレビューできる状態へ整える工程であり、提案値の自動採用やDB適用を意味しない。

## 6. 実施時の記録方法

各項目へ対象コミット、ルール版、試験名または操作手順、環境、結果、証拠パス/CI実行先、残件を追記する。自動試験、模擬画面、iPhone実機、翻訳文言のレビュー、公開URL確認を区別する。必要な実機確認が残っている場合は、実施済みの自動試験を記録した上で残件を明示し、項目全体を完了とはしない。
