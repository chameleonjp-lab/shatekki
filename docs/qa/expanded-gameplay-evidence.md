# 追加機能（D34〜D37）の受入確認の証拠（EG10・試作）

[2026-11-06 要件修正書](../changes/2026-11-06-expanded-gameplay-requirements.md) の §12 にある CH-AC01〜CH-AC44 について、どの試験で何を確かめたかを記録します。公開中のゲームは今までどおり rules-v1 のままで、ここに書くのは内部試験用の試作ビルド（`expanded-proposed`）の結果です。

- 確認したコミット：`47725a9`（ブランチ `feat/eg10-acceptance`。土台の `feat/eg07-expanded-ui` を取り込んだ状態。今回の試験の追加は `05b43e9` まで）。
- 実行日：2026年11月6日。
- 実行した試験：単体 711件・統合 247件（`npm run test:unit` / `npm run test:integration`、失敗0・スキップ0）、ブラウザ 14件（`tests/e2e/expanded-gameplay.spec.ts` と `expanded-smoke.spec.ts` を iPhone縦・短い縦の2画面設定で各7件）。最終の件数は末尾の「実行結果」に書きます。
- 環境の書き方：**Node**＝Node上の自動試験（物理はRapier、モデル試験を含む）／**Chromium**＝iPhone縦画面をまねたブラウザ自動試験／**実機**＝iPhone Safari。実機での確認は1件もありません。

## 読み方

結果の言葉は次のとおりです。

| 言葉 | 意味 |
|---|---|
| 自動確認 | 書いてある試験が通った。Node／Chromiumでの結果で、実機の結果ではない。 |
| 一部 | 偽物（保存先の模擬など）やモデルの試験だけ、または条件の一部しか試していない。「残り」に足りない所を書く。 |
| 未確認 | 試験がない、または実機・試聴・母語話者・利用者の判断が必要。 |
| 判断待ち | 利用者の判断が先に必要（C01〜C05、仕様確認メモの4つ）。 |

**事実**：下の表の試験名は、試験ファイルを読んで確かめたものです。「通った」は上のコミットでの結果です。
**意見**：「残り」に書いた見立ては、わたしの意見です。

## 今回足した試験

`tests/integration/expanded-acceptance.test.ts`（11件）。本物の司令役・物理・効果計画・確定処理をそのまま使い、発射も `FIRE` と `frame()` で動かしています（模擬は使っていません）。始めの状態（棚、背景マスの効果、質問の順番、残りの弾）だけは決まった結果になるよう作っています。

- CH-AC43：最後の弾で3本のコルクを撃ち、2つの背景マスと店主に同時に当てます。質問→答え（品揃え変更）→景品の落下→2景品セットと3景品セットが同時に成立、までを各1回だけ確定するか確かめます。続行する版（背景マスが弾+1をくれる）と、終了する版（弾をもらえない）の両方があります。品揃えを変えた結果で景品がどう落ちるかは種によって変わるため、この試験は1から80までの種を順に試し、最初に「2景品と3景品が同時に成立する」種を使います（探す処理も決まった順序で、毎回同じ種になります）。
- CH-AC26：最後の射の「答え」で弾がもらえて続行する場合（先に背景マスで予約した次の射の効果も残る）と、追加弾の累計が上限10発で弾をもらえず説明つきで終わる場合。
- CH-AC12：3本のコルクが店主に何度当たっても質問は1回。次の射では次の質問が出る。
- CH-AC22：3本のコルクが同じ背景マスに当たっても、効果は1回。
- CH-AC23：使った背景マスは、次の射・補充・品揃え変更・保存と読み込みのあとも使用済みのまま。
- CH-AC38：非表示・横向きを重ねても、同じ質問のまま、時間が飛ばず、勝手に答えず、復帰後に答えは1回だけ受け付ける。演出省略も答えにならない（CH-AC16）。
- CH-AC11・CH-AC18：200問すべての2択が別の候補の集まりを指す。シリーズの景品をすべて集めても、成立するのは図鑑にあるセットだけ。
- 追加で、店主の部位の加点は最初の射だけ（CH-AC17）も確かめています。

この試験でゲームの不具合は見つかりませんでした（試験の書き方の間違いは直しました）。

## CH-AC01〜CH-AC44

試験の略称：`unit/` と `integration/` は `tests/` 以下、`e2e/` は `tests/e2e/` 以下。「acceptance」は今回の `integration/expanded-acceptance.test.ts`。

| CH-AC | 確かめた試験（ファイル「名前」） | 環境 | 結果 | 残り |
|---|---|---|---|---|
| 01 | unit/expanded-layout「has 36 distinct slots and 36 cells paired one to one」「creates a schema-2 run with 36 prizes, 36 unused cells and shuffled questions」、unit/replenish「createRun fills all 36 distinct v2 slots」、e2e/expanded-smoke「the prototype build starts a 36-prize run …」 | Node・Chromium | 自動確認 | 実機で最初の画面を見ていない。 |
| 02 | unit/expanded-layout「slot occupancy boxes …」、integration/expanded-view-contract「keeps one exact invisible proxy per surface … and the 36 cells」「covers every surface box with the static mesh …」「draws all 36 cells …」「can aim at the shopkeeper and at the left-end devices from the end of the stand range」「brings both end columns … into view」、integration/expanded-layout-world「end-column cells are reachable within the camera aim limits」 | Node | 自動確認 | 実機での狙いやすさ（両端・上下段・店主）は未観察。 |
| 03 | e2e/expanded-gameplay「the overview shows 3 × 12 and the stand reaches both ends (display only)」（全体図を見ても弾数10・位置の段階のまま）、unit/stand-step、integration/expanded-view-contract「moves the picture continuously with the stand …」 | Node・Chromium | 一部 | 全体図の表示と状態不変までは確認。実際の指の動きで位置移動と照準が混ざらないかは実機が必要。 |
| 04 | unit/gameplay-effects「assortment changes every uncollected prize … also off-screen ones」、integration/expanded-view-hints「outlines every member of the series by its CURRENT kind (also off-screen) …」、integration/expanded-shot「same seed and inputs give the same barrier and record whatever the step chunking」 | Node | 一部 | 計算は画面の見え方を入力にしていないので視点で変わらない設計だが、視点を変えて比べる試験はない。 |
| 05 | unit/replenish「refills emptied slots from the subset only」「defers a blocked v2 slot and never moves or deletes the blocking prize」、unit/expanded-settlement「refills only from the assortment series while one is active」 | Node | 自動確認 | — |
| 06 | unit/expansion-catalog「has 300 pairs over 600 references covering all 100 prizes, no duplicate unordered pair」「rejects a reversed duplicate pair」、unit/pair-sets「real expanded catalog: PAIR001 is P001 + P002 …」 | Node | 自動確認 | 300組の中身（組み合わせ・名前・ヒント）の採否は C01 で判断待ち。 |
| 07 | unit/expansion-catalog「expanded-proposed adds 300 prototype pair sets and keeps S001-S100 and the 100 prizes」「does not touch the approved rules-v1 data」、unit/set-book-expanded「lists 100 three-kind sets and 300 pair sets …」 | Node・Chromium | 自動確認 | — |
| 08 | unit/pair-sets「two different kinds over two shots complete the pair on the second shot」「two prizes of the same kind never complete a pair」 | Node | 自動確認 | — |
| 09 | unit/pair-sets「a pair and a trio completing on the same shot each score once, from their own config (50 vs 100)」「collecting the same kind again later adds no second set score」「re-processing the same record adds 0 points and no set」、acceptance（CH-AC43の組み合わせ） | Node | 自動確認 | 2景品の点数50は試作値（C01）。 |
| 10 | unit/profile-versions「merges old discoveries and re-merges what an old app wrote later; PAIR sets are stored」 | Node（保存先は模擬） | 一部 | 新しいゲームで成立状態が空に戻ることを、追加機能で直接確かめる試験はない（新規作成の処理は旧ルールと同じ部品）。 |
| 11 | unit/expansion-catalog「has 200 questions with 400 choices whose A and B groups differ」、unit/shopkeeper-questions「every question offers two choices with different lottery groups」、acceptance「every question has two choices pointing to existing groups with different candidate sets」 | Node | 自動確認 | 問いと選択肢の文面の採否は C02 で判断待ち。 |
| 12 | acceptance「three corks on the shopkeeper ask one question; the next shot asks the next one」、unit/shot-effect-plan「a shopkeeper hit pauses at stage question …」、e2e/expanded-gameplay「a cork on the shopkeeper asks one question; one answer continues the game」 | Node・Chromium | 自動確認 | — |
| 13 | unit/shopkeeper-questions「shuffles all 200 questions exactly once, without repeats」「is reproducible …, and differs between seeds」「even the maximum of 20 shots uses only 20 of the 200 questions, all different」、unit/expanded-layout「is deterministic per seed …」 | Node | 自動確認 | — |
| 14 | unit/expanded-controller「advances nothing while waiting and does not carry the waited time over」、integration/expanded-controller-run「a cork on the shopkeeper asks one question, waits, takes one answer and settles once」（待つ間のコマで景品が動かない）、acceptance（CH-AC38の試験） | Node・Chromium | 自動確認 | — |
| 15 | unit/expanded-controller「rejects answers while paused, for another shot or question, and a second answer; resumes once」、unit/shopkeeper-panel「sends exactly {type, shotId, questionId, choice} once, and a double tap does not answer twice」、unit/shot-effect-plan「accepts one answer …」「draws uniformly among the applicable effects of the chosen group」 | Node | 自動確認 | 「画面更新で効果が1件」のうち、読み込み直しは CH-AC37 の試験で中断になる。 |
| 16 | unit/shopkeeper-panel「has no timer …」、acceptance（CH-AC38：演出省略でも答えが必要）、e2e/expanded-gameplay「reloading while the question is shown abandons the shot …」 | Node・Chromium | 自動確認 | — |
| 17 | acceptance「three corks on the shopkeeper …」（2回目の質問で店主の部位に加点がない）、unit/expanded-settlement「moves the reservation to next, clears active, and takes the question cursor only when a question was asked」、e2e/expanded-gameplay（確定後に質問回数1・店主の初回フラグあり） | Node・Chromium | 自動確認 | — |
| 18 | unit/expansion-catalog「has 100 effects … 20 series with >=3 prizes …」、acceptance「collecting every kind of a series completes only catalog sets inside it …」 | Node | 自動確認 | シリーズ20件の中身（景品の割り当て）は C03 で判断待ち。 |
| 19 | unit/gameplay-effects「covers all 100 effects」と効果ごとの100件、「values are clamped to the profile limits」、unit/expansion-catalog | Node | 自動確認 | 各効果の値は試作値（C03）。 |
| 20 | unit/background-cells（5件）、integration/expanded-checkpoint「a fresh and a post-shot state restore with the same shelf, cells, question order …」 | Node | 自動確認 | — |
| 21 | integration/expanded-layout-world「a cell behind a prize is not activated through the prize」「rules-v1 style context (no expanded) never activates cells …」、integration/expanded-shot「shopkeeper: … a prize contact does not」 | Node | 自動確認 | — |
| 22 | integration/expanded-layout-world「a contact on the boundary of two cells activates exactly one (the lowest id) …」「a second contact with the same activated cell in one shot only reflects」、acceptance「three corks into one cell give one request, one effect and one used cell」 | Node | 自動確認 | — |
| 23 | acceptance「reflects later corks without acting again, and the saved game restores it as used」、integration/expanded-layout-world「a used cell reflects without activating」、integration/expanded-checkpoint（復元） | Node（保存先は模擬） | 自動確認 | 品揃え変更は答えを経由した場合を、CH-AC43の試験でも通している。視点移動は計算に入らないので試験なし。 |
| 24 | unit/shot-effect-plan「with no applicable effect the entry is notApplicable/noApplicableEffect …」、unit/gameplay-effects「bonus already 10 is an explicit not-applicable outcome」、unit/effect-results「shows the reason for a notApplicable answer draw …」、unit/expanded-settlement「marks the cells used (also when the effect could not act) …」、acceptance（上限で弾がもらえない射） | Node | 自動確認 | 実機で理由の文章が読みやすいかは未確認。 |
| 25 | unit/gameplay-effects「bonus 9 and a request of +2 really gives +1 …」「the firing-room cap also limits an add」、unit/shot-effect-plan「plate and cell +ammo share one cap …」、acceptance（累計10発・最大20射の確認） | Node | 自動確認 | — |
| 26 | acceptance（答えで弾がもらえて続行／上限で終了／CH-AC43の続行と終了）、unit/expanded-settlement「ends the game only when the final ammo is 0, and a final answer of +1 continues with the reservation kept」、unit/shot-effect-plan「an earlier next-shot boost with 0 corks left survives a final answer that gives +1」 | Node | 一部 | 終了の「説明」は結果の文章（理由の表示）の試験まで。終了時の結果画面に出る文を通しで見る試験はない。 |
| 27 | unit/gameplay-effects「the last value wins per field …」「FX082 resets every reserved setting …」、unit/expanded-transitions「moves next → active, resets next …」、integration/expanded-shot「speed, gravity and radius apply to every cork …」、acceptance（予約が次の射に残る） | Node | 自動確認 | — |
| 28 | unit/expanded-transforms「a dislodged prize keeps instance, slot, pose including Y and stays dislodged …」「HP keeps its ratio …」、unit/gameplay-effects「assortment changes every uncollected prize … also off-screen ones」 | Node | 自動確認 | — |
| 29 | unit/expanded-transforms「a mounted prize stays mounted with the same phase; the old motion keeps running」「… survives a re-sync from its state」 | Node | 一部 | 「新規補充は新種類の動き」を直接見る試験はない（補充は種類の設定から作る部品）。 |
| 30 | unit/expanded-transforms「defers the whole intent, with the same candidate order, when nothing fits」「a taller shape would sink into the board …」、unit/shot-effect-plan「… are rechecked first, with their fixed candidate order and without using the PRNG」、unit/expanded-settlement「… replaces deferred transforms (dropping collected prizes)」、unit/effect-results「announces deferred transforms」 | Node | 自動確認 | 背の高い種類への変化がほぼ毎回延期になるかの判断は、仕様確認メモの1で判断待ち（自動の打ち手24ゲームで約16%が延期）。 |
| 31 | unit/expanded-transforms「HP keeps its ratio … rounded once」「several intents for one instance …」、integration/expanded-shot「collected as the new kind in the same shot」、acceptance（CH-AC43：変化後の落下を同じ射の獲得・セットに数える） | Node | 自動確認 | — |
| 32 | unit/gameplay-effects「outline and assortment are kept apart」、unit/expanded-settlement「refills only from the assortment series while one is active」、integration/expanded-view-hints「draws used cells from the view state and shows the refill series in the legend」 | Node | 自動確認 | — |
| 33 | integration/expanded-view-hints「outlines every member of the series by its CURRENT kind (also off-screen) and follows a transform」、unit/expanded-i18n「the same series has the same symbol everywhere and each symbol is unique」 | Node | 一部 | 縁の色と記号が実際の画面で見分けられるかは実機未確認。 |
| 34 | unit/shot-effect-plan「requests are processed in (time, contact order, target id) order whatever the input order」「planning the same state twice gives identical plans …」「viewing the pending question again never advances any random stream」、integration/expanded-shot「… whatever the step chunking (1/60, 1/30, 0.1)」、acceptance（演出省略でも答え待ちは変わらない） | Node | 自動確認 | 描画の速さを変えた通しの比較は、物理の刻み幅を変える試験で代えている。 |
| 35 | unit/expanded-settlement「refuses an unfinished plan, a record of another barrier or shot, and rules-v1 runs」、unit/expanded-controller「barrier without a question resumes at once」、acceptance（答えを待つ間は得点・台帳・使用済みが空） | Node | 一部 | 落下猶予を追加機能の射で再延長しないことを直接見る試験はない（旧ルールの unit/transform-grace「never re-extended」は通る）。 |
| 36 | integration/expanded-checkpoint「a fresh and a post-shot state restore with the same shelf, cells, question order and cursor, reservation and series」 | Node（保存先は模擬） | 一部 | 保存先がブラウザの本物ではなく模擬。ブラウザでの再読み込みは CH-AC37 の e2e のみ。 |
| 37 | integration/expanded-checkpoint「a state waiting for the answer restores as abandoned …」「a state in post-effects restores as abandoned too」、e2e/expanded-gameplay「reloading while the question is shown abandons the shot; nothing is redone or ranked」 | Node・Chromium | 自動確認 | 実機のSafariでの再読み込みは未確認。 |
| 38 | acceptance「stays on the same question, loses no time, answers nothing by itself, then takes exactly one answer」、unit/expanded-controller「rejects answers while paused …」 | Node | 一部 | 本物のアプリ切替・横向き（イベントの届き方）は実機が必要。ここでは司令役の一時停止の入口を直接呼んだ。 |
| 39 | integration/expanded-checkpoint「two tabs conflict like today」「a failed pre-shot save keeps the flags as before」、unit/profile-versions「two stores (tabs) never lose a discovery or a higher best」「keeps playing in memory when storage fails …」 | Node（保存先は模擬） | 一部 | 本物の複数タブ・保存失敗は試していない。 |
| 40 | unit/profile-versions（13件。旧自己ベストを旧ルールの最高として保ち、v1の保存を書き換えない）、integration/expanded-checkpoint「never touches the rules-v1 key …」、e2e/expanded-smoke「… saved under its own key …」 | Node・Chromium | 一部 | 旧ルールの「送信待ち」を保つ試験は追加機能側にはない。名前・設定は旧ルールの保存を触らないことで代えている。 |
| 41 | unit/expanded-i18n（96件）、unit/result-expanded（結果と図鑑の名前が15言語で一致）、unit/shopkeeper-panel「keeps long texts in the panel」、unit/effect-results「has all new keys in every locale」、e2e/expanded-gameplay（質問と2択が画面内に収まる） | Node・Chromium | 一部 | 2026年11月7日（計画T1）に、残っていた5言語（繁体字中国語・インドネシア語・トルコ語・ベトナム語・タイ語）を足し、15言語すべての辞書に300組の名前とヒント、200問・400択、6区分、100効果の名前と結果、20シリーズ、固定文がそろった。試験は各言語の辞書そのものを数える。英語で補う動きは、わざと項目を外した試験用の辞書で確かめる。繁体字は簡体字版をOpenCC（s2twp）で変換し、既存の繁体字の景品名に合わせた。ほかの4言語は英語版からClaudeが訳した。どの言語も母語話者の確認はなし。長文の2択は日本語だけをブラウザで確認。音を聞いての確認はなし。 |
| 42 | integration/expanded-performance（重い3場面）、e2e/expanded-performance、記録は [expanded-performance.md](expanded-performance.md) | Node・Chromium | 一部 | iPhone実機の毎秒のコマ数・発熱は未計測。縁の表示と追加案内を全部出した状態も実機では未計測。 |
| 43 | acceptance「confirms the whole chain once and the game goes on because the cell gave a bullet」「the same chain without any bullet gained ends the game only after the answer …」 | Node | 自動確認 | 実機での通しの操作は未確認。 |
| 44 | unit/app-bundle（2件：旧ルールが既定、追加機能は内部指定のみ）、unit/expansion-catalog「is never ranking-eligible …」、unit/release-config「starts approved rules-v1 runs with all existing … values unchanged」、e2e/expanded-smoke「a URL parameter cannot switch the public build to the prototype」、unit/profile-versions「leaves the v1 key byte-identical after expanded writes …」 | Node・Chromium | 自動確認 | ランキング・実験場の本番側は、追加機能では触っていないことを試験で確認したのみ（本番通信は未確認）。 |

集計（わたしの数え方）：自動確認 31件、一部 13件。実機で確かめたものは0件です。

## 旧ACを追加機能のルールで確かめ直した結果

要件修正書は、旧 AC11・AC17・AC18・AC25・AC35〜AC45 を追加機能を含めて確かめ直すよう求めています。

| 旧AC | 追加機能での確認 | 結果 |
|---|---|---|
| AC11 補充 | unit/replenish（36枠での補充と延期）、unit/expanded-settlement（シリーズ中の補充）。上のCH-AC05と同じ試験 | 自動確認 |
| AC17 追加弾の上限 | acceptance（累計10発で終了、最大20射）、unit/gameplay-effects・shot-effect-plan（板と背景の弾が共通の上限） | 自動確認 |
| AC18 最後の弾 | acceptance（CH-AC43・CH-AC26：続行と終了、最後の連鎖の景品・セットを結果に含む） | 自動確認 |
| AC25 店主の初回加点 | acceptance（2回目の質問で加点なし、質問回数は別管理）、e2e/expanded-gameplay | 自動確認 |
| AC35 言語 | unit/expanded-i18n。15言語とも辞書がそろう（母語話者の確認は未実施） | 一部（CH-AC41と同じ） |
| AC36 音 | unit/audio（27件）。追加機能の音の接続は EG09 で入ったが、聞いての確認はなし | 一部（試聴なし） |
| AC37 一時停止 | acceptance（CH-AC38）、unit/expanded-controller | 一部（実機未確認） |
| AC38 保存 | integration/expanded-checkpoint | 一部（保存先は模擬） |
| AC39 復帰 | integration/expanded-checkpoint、e2e/expanded-gameplay | 自動確認（Chromium） |
| AC40 負荷 | integration/expanded-performance、e2e/expanded-performance | 一部（実機未計測） |
| AC41 保全 | integration/security（今回のコードでも通る）。unit/profile-versions | 一部（本番の旧記録はTask 18） |
| AC42 境界の組み合わせ | acceptance（CH-AC43）。旧ルールの integration/acceptance-composite も通る | 自動確認（中断との組み合わせは CH-AC37 の試験） |
| AC43 特殊効果は装置ごとに1回 | 装置は旧 unit/devices-sim。背景マスは acceptance（CH-AC22） | 自動確認 |
| AC44 景品変化 | unit/expanded-transforms、acceptance（CH-AC43） | 自動確認 |
| AC45 落下猶予 | 旧 unit/transform-grace は通る。追加機能の射での再延長なしは直接の試験なし | 一部 |

## 利用者の判断が必要なもの

- C01〜C05（[open-items.md](../open-items.md)）：300組の構成、200問の文面、20シリーズ・100効果の値、36枠・背景マスの操作と負荷、保存の版分けと15言語。どれも試作値のままで、採用とは扱っていません。
- 仕様確認メモの4つ（[メモ](../handoff/to-chatgpt/2026-11-06-1700-claude-expanded-judgement-calls.md)）：背の高い種類への変化の延期、品揃え変更の候補順の引き方、FX090の向き、分裂角の倍率の範囲。試作はメモの「いまの実装」で動いています。
- 正式有効化とランキング・実験場の連携：今回の対象外で、判断も記録していません。

## まだ確かめていないこと

- iPhone Safari実機での操作（位置移動と照準、全体図、両端・上下段・店主）、縦／横／アプリ切替、音、最大負荷、発熱。
- すべての言語の母語話者による確認（15言語の辞書はそろったが、読んだ人の確認はまだない）。
- 本物のブラウザでの複数タブ・保存失敗。
- 人が遊んだときの取れ方や、セットの成立のしやすさ（自動の打ち手の数字だけで決めない）。

## 実行結果（最終）

- `npm run typecheck`：エラーなし。
- `npm run test:unit`：711件通過、失敗0、スキップ0。
- `npm run test:integration`：247件通過（今回の `expanded-acceptance.test.ts` の11件を含む）、失敗0、スキップ0。
- ブラウザ（`npm run build && npm run build:expanded` のあと `expanded-gameplay` と `expanded-smoke` を iPhone縦・短い縦の2画面設定）：14件通過。`expanded-performance` は今回は再実行していない（記録は [expanded-performance.md](expanded-performance.md)）。
- iPhone実機：0件。
