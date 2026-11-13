# シャテッキ：PR #23後の残作業を完了する実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. 担当と実行方法は既存の申し送り規約を優先する。

**Goal:** 残作業10項目を、保存・品替え・演出の実装、再現可能な検証、正式化の判断まで追跡できる工程にする。

**Architecture:** 旧9枠版と既存の内部試作r001〜r003を保ち、保存・品替え・時計の変更をr004・r005・r006へ順に固定する。確定した記録だけを図鑑・結果・演出へ渡し、正式版への切替は検証と採用記録をそろえた別PRにする。

**Tech Stack:** TypeScript 5.9.3、Three.js 0.186.1、Rapier 0.21.0、Vite 8.3.4、Vitest 4.1.12、Playwright 1.63.0、Node 22以上。既存の固定版を使用し、新しい外部サービスは使わない。

**Spec:** [追加要件D34〜D37](../../changes/2026-11-06-expanded-gameplay-requirements.md)、[PR #19後の計画](2026-11-07-post-pr19-gameplay.md)、[実装記録](../../qa/post-pr19-evidence.md)、2026年11月14日の「残作業10項目を計画→敵対的検証→反映→PR」の依頼。

文書状態：敵対的検証反映版v3。基準main：6591d96f300ec4e16b45d58e56a793d407413a9a（PR #23マージ）。この文書のチェックは将来の実装用であり、今回の文書PRで完了にしない。

## Global Constraints

- D34〜D37：2景品セット300組、店主200問・各2択、縦3段×横12列、背景36マス・100効果・各マス1ゲーム1回。既存3景品100組・景品100種類を残す。
- 初期10発、追加累計10発、最大20射。既存効果の後にA1→A10を適用し、最終残弾で続行を決める。判定・加点をアニメーションから変更しない。
- 飛行・質問・落下中の再読み込みは中断として扱い、無料撃ち直しとランキング送信をしない。確定済みの獲得・図鑑は巻き戻さない。
- 旧スコア・自己ベスト・名前・設定・識別値・図鑑・送信待ちを初期化しない。旧正式値data/release-approved-v1.jsonを上書きしない。
- 公開用はofficial-v1。ランキング非公開・実験場未連携を維持する。新しい正式値・36枠版の公開判断は今回の文書PRの承認に含めない。
- 15言語：ja/en/es/pt-BR/zh-Hans/fr/de/ko/ru/it/zh-Hant/id/tr/vi/th。新しい保存案内・結果・日替わり・失敗表示も対象。
- iPhone 17 Pro Safariを主な確認端末とする。自動確認は402×874と402×700を含め、既存375×600も残す。画面サイズをまねるChromiumは実機合格に数えない。
- main直push・自動マージ・既存データ削除・新規課金・Codex Cloud利用をしない。PRのマージは利用者が行う。

## Review Focus

1. 保存が成功しても応答だけ失われる：同じ操作番号の再試行で弾・得点・図鑑が増えない（R01〜R05）。
2. 複数タブの勝者が発射中に敗者が再読込する：敗者の参照だけで勝者のゲームを中断させない（R03）。
3. 品替え直後に周期運動・復帰が走る：底の補正が元に戻らず、別景品や棚へ押し込まない（R06）。
4. 日付変更・言語変更・描画遅延：同じゲーム内時刻の操作は同じ確定結果になる（R09〜R10）。
5. 最後の射で初発見・補給・結果遷移が重なる：実増加数だけを表示し、音と動きが重複せず再表示でも加算しない（R04・R07〜R08）。

---

## 1. 現状と10項目の対応

2026年11月14日にmain、開いているPR、計画、実装記録、関連コード・試験を照合した。PR #23までマージ済み、開いているPRは0件。最新[CI 42306514896](https://github.com/chameleonjp-lab/shatekki/actions/runs/42306514896)と[Pages 42307222731](https://github.com/chameleonjp-lab/shatekki/actions/runs/42307222731)は成功し、deployの実行ステップまで確認した。公開ページの実表示とiPhone実機は未確認。

| 残作業 | 現行との差 | 担当工程・確認番号 |
|---|---|---|
| ① 保存を作り直す | localStorageの個別保存。保存失敗でも発射が進む。図鑑と結果の保存順も分かれている | S01・S02、R01〜R05 |
| ② 品替えの高さ | 底の高さを保つ案が旧計画に採用済みだが、処理と試験は中心固定 | S03、R06 |
| ③ 演出・装置の見た目 | P1・P3の動き、P5の刻みが未実装。P4と装置配置は目視未確認 | S04、R07〜R08・R15 |
| ④ 日替わりの再現性 | 初期棚等の一致まで。描画間隔・言語を変えた一射の一致は未確認 | S05、R09〜R10 |
| ⑤ 不足する自動確認 | 実ブラウザの保存失敗・競合、補充時の動き、落下猶予、旧記録保護に不足 | S06、R11〜R13 |
| ⑥ iPhone実機 | 操作・音・負荷の実測記録なし | S07、R14〜R16 |
| ⑦ バランス | 人の試遊と4版比較、補給元別の成立・実増加の記録なし | S08、R17〜R18 |
| ⑧ 翻訳・長文 | 辞書は15言語そろう。自然さ・長文の全言語確認は残る | S07、R19 |
| ⑨ 正式版への切替 | 公開用は9枠。追加機能は試作値で、正式採用されていない | S09、R20〜R21 |
| ⑩ 資料・Issue整理 | 古い「未翻訳・公開設定待ち」やPRマージ前の記述が残る | S10、R22 |

A1〜A10の計算、E1ベストショット、E2注文、E3おみやげ棚、E4日替わりの初期化、結果のセット名・最終効果、15言語の辞書は既存実装を使う。旧計画を最初から作り直さない。旧CH-AC26の「結果に終了理由を表示する試験がない」はT1の画面試験で補完済みなので、古い表の「一部13件」を現在の未完了件数として転載しない。

## 2. 今回の計画で固定する実装方針

### 2.1 版と記録の境界

既存の3内部版は比較用に残す。S00〜S02の保存改修はexpanded-save-trial / rules-v2-proposed-r004、S03の底補正はexpanded-placement-trial / rules-v2-proposed-r005、S05の時計統一後はexpanded-next / rules-v2-proposed-r006とする。これらは実装上の名前で、正式採用を意味しない。各段階は新しい保存先を持ち、前段階の進行中の回を次版へ変換しない。

| 版 | 動作・保存 | 公開物 |
|---|---|---|
| official-v1 | 旧9枠・旧保存先のまま | site-distのみ |
| r001〜r003 | 既存計算・中心固定・既存保存先。継続中の回をr004へ変換しない | internal-expanded-dist / internal-rewards-dist等 |
| r004 | S00〜S02：補給10件＋一括保存。中心固定・従来の時計 | internal-save-trial-dist、4176番 |
| r005 | S03：r004＋底補正。従来の時計 | internal-placement-trial-dist、4177番 |
| r006 | S05：r005＋ゲーム内時刻の統一 | internal-next-dist、4178番。通常のPages配信対象にしない |
| 将来の正式版 | S08の採用値を新しい固定ファイルへ保存して作る | S09で別PR。試作の得点は引き継がない |

新規data/expansion-v2/next-profile.jsonには、r004・r005・r006ごとの固定設定を追加する。r003の報酬値からの差分と、persistencePolicy（legacy/atomic）、transformPolicy（preserve-center/preserve-supported-bottom）、clockPolicy（frame/fixed）をGameplayBundleへ渡す。S00はr004だけを登録し、S03でr005、S05でr006を追記する。過去のentryを上書きしない。各版のbuild/previewを残して旧進行を同じ版で再開できるようにし、違う版のキーを読込・移行しない。装置の判定位置や調整値をさらに変える場合はr007以降へ進める。

### 2.2 保存する単位と成功の意味

端末内の複数の記録を、一度に成功または失敗させる。ブラウザの一括保存機能（IndexedDBのreadwrite transaction）を使い、外部データベースへの通信は追加しない。

新規src/contracts/persistence.tsに以下を定義する。既存RunState・ShotSummary・FinalResult・SetIdを使用し、型を重複させない。

    type RunScope =
      | { mode: 'normal'; rulesVersion: string }
      | { mode: 'daily'; rulesVersion: string; startedDateJst: string };
    interface SaveToken { runId: string; revision: number; ownerEpoch: number; }
    interface PersistedRecord {
      scope: RunScope; token: SaveToken; ownerId: string; state: RunState; gameTick: number;
      lastSummary: ShotSummary | null; result: FinalResult | null;
      selfBestBefore: number | null; newBest: boolean; resultViewOpen: boolean;
    }
    type SaveReply =
      | { ok: true; record: PersistedRecord; freshSets: readonly SetId[]; replayed: boolean }
      | { ok: false; reason: 'quota' | 'unavailable' | 'blocked' | 'conflict' | 'invalid'; };
    interface RunRepository {
      read(scope: RunScope): Promise<PersistedRecord | null>;
      start(scope: RunScope, initial: RunState, expected: SaveToken | null): Promise<SaveReply>;
      claim(scope: RunScope, expected: SaveToken, resolution: 'resumeStable' | 'abandonInFlight'): Promise<SaveReply>;
      saveCommand(input: { expected: SaveToken; operationId: string; state: RunState; gameTick: number }): Promise<SaveReply>;
      commitShot(input: { expected: SaveToken; state: RunState; summary: ShotSummary; gameTick: number }): Promise<SaveReply>;
      closeResult(expected: SaveToken): Promise<SaveReply>;
    }

新規DB名shatekki.checkpoints、初期schemaVersion=1。object storeはruns（scopeKey、runIdの一意index）、profiles（通常はmode・rulesVersion、日替わりbestは開始日も含む）、receipts（runId・operationId）、meta（import記録とshared souvenir revision）、souvenirs（共通3枠）とする。日替わり図鑑はmode・rulesVersionで日をまたいで保持し、その日の自己ベストだけを日付で区切る。旧日替わりのbestは日付不明の旧記録として表示し、特定日のbestへ移さない。日付はscope作成時に固定し、今の端末日付で読込先を上書きしない。進行中の回への案内用active scopeも同じDBで更新する。

保存部品はcreateIndexedRunRepository(factory: IDBFactory, writerId: string)で作る。writerIdはページの実行ごとに新しく生成し、readで受け取ったownerIdを流用しない。start/claimだけが所有者をwriterIdへ設定する。進行を変える通常の書込みは保存済みownerIdがその部品のwriterIdに一致することも確認する。複製タブや再読込は別writerIdとなり、最新tokenを読んだだけでは進行を書き換えられない。終了済み結果を明示的に閉じる操作だけは後述の例外とする。scopeKeyはmode・rulesVersion・dailyなら開始日から同じ純粋関数で作り、保存入力のstate.rulesVersion/runIdとも照合する。

発射のoperationIdはrunId/shotNumber/fire、確定はrunId/shotNumber/settle。STOP_LOAD・CONFIRM_POSITION・ORDERにも入力受付時に番号を与え、再試行で同じ番号と内容を使う。saveCommand/commitShotでは次の順序を一つのtransaction内で守る。

1. 入力のscope・runId・operationId・内容を検証し、その操作番号のreceiptを読む。
2. 成功済みなら内容の一致を調べ、一致時はreplayed=trueで返す。異なる内容はinvalid。返すrecordはその操作直後の古い写しではなく、現在の最新記録とする。既に別runになっている場合はconflictとし、旧結果は履歴の読取りだけに使う。
3. 未実行の操作だけ、ownerId=writerId、runId、revision、ownerEpoch、許可される段階を照合する。合わなければconflict/invalid。
4. 状態・profile・receipt等をまとめて更新し、transaction.oncompleteでだけ成功を返す。request.onsuccessだけでは成功にしない。

replayed=trueを受けた経路は発射・加点・朱印・音・所有権の再取得を行わない。発射保存だけ成功して応答が失われた場合もworld.fireを再実行せず、未確定射として中断案内へ進む。所有権移転前のreceiptを読んでも新しい書込み権限は得られない。内容比較用の正規化はtransactionを開く前に行い、開いた後に通信・タイマー・暗号処理等の別の非同期処理を待たない。

startは記録なし、または明示的に終了結果を閉じた現在tokenにだけ成功する。進行中の回を無断で置き換えない。claim('resumeStable')は射撃間の記録だけへ適用し、epochを増やす。飛行・質問・落下中は再開できない。再読込画面ではその旨を示し、明示的なclaim('abandonInFlight')でownerとepochを更新して中断を確定する。別タブのreadは中断もclaimもしない。古い所有者の遅れた保存はepochとownerIdで拒否する。

closeResultはendedまたはabandonedの終端状態だけへ適用する明示的な閲覧終了操作とする。再読込後の非所有者も現在のrunId・revision・ownerEpochが一致すれば実行できる。transaction内で終端状態とtokenを照合し、resultViewOpenをfalse、revisionを+1にする。ownerId・ownerEpoch・結果・図鑑・得点等は変えない。進行中はinvalid、他タブが別runを始めた場合や先に更新した場合はconflictとして最新値を読み直す。同じrunが既に閉じていれば再書込みせず最新recordを返す。そのtokenによるstartだけが、新しいrunIdとwriterIdで次のゲームを作る。これにより「終了/中断済み→再読込→閉じる→新規開始」を可能にし、読取りだけで結果を閉じることはしない。

commitShotは得点台帳・残弾・使用済み・注文・景品・補充・抽選状態・次射予約・要約・図鑑差分・自己ベスト・終了結果を同じtransactionに入れる。途中でthrow、abort、容量不足なら全て未確定。新しいprofile処理は既存discoverSets/recordRunEndを別に呼ばず、その純粋な計算をtransaction内へ移す。freshSetsとnewBestは保存済みの差分を返す。読み取りや結果の再表示で更新しない。

| 場面 | 振る舞い |
|---|---|
| 発射前の保存失敗 | 表示残弾・物理・発射音を進めない。同じ操作の再試行か、ホームから別の記録なしゲームを選ぶ |
| 確定保存失敗 | 一射の候補結果と処理済み物理をメモリに保持して停止。再試行は物理を再実行せず同じ候補を保存。reloadしたら未確定射として中断 |
| 保存成功後に画面応答が失われる | 同じreceiptを読む。補給・初発見・自己ベストをもう一度付与しない |
| 2タブで同じ回を操作 | 同じrevisionに対する一方のみ成功。敗者は入力を止めて読取専用へ。通知が届かなくても各書込前の照合で拒否 |
| 別タブの発射中に読込 | readは中断処理をしない。現在の状態を表示するだけ。明示的に所有を移す場合はepochを進め、未確定射なら中断と明示する |
| 終了→結果→図鑑→戻る | 確定結果を読む。約0.9秒の切替前後のreloadでも同じ結果。閉じる操作はresultViewOpenだけを変える |
| DBを開けない・更新がblocked | 理由を表示し再試行できる。無断で旧localStorageへ書き戻さない。versionchangeを受けた接続は閉じて入力停止 |

「この画面だけで遊ぶ」は新しいrunIdで初めから開始する。R05の書込み0は、この回を開始してから終了するまでに回に起因する書込みを数える。途中結果を複写してやり直す入口にしない。その回はreloadで終了し、進行・図鑑・自己ベスト・おみやげ・ランキング・送信待ちへ書かない。設定は既存値を読む。保存復旧後もその回を永続記録へ昇格させない。

旧保存先はread-onlyで扱う。新旧ルールの自己ベストは分け、旧スコアをr004の自己ベストにしない。通常の旧図鑑は同じS番号の参照として取り込み、日替わりには通常の図鑑を混ぜない。importの記録と取り込んだ差分は同じtransactionにする。壊れた旧値は原文を残し、取り込めなかったと表示する。旧書込みが後から増えた場合はS集合の追加だけを再照合し、旧キーへ書かない。通常のprofile.v2にあるPAIR発見も、既存の種類・組合せが同じ番号だけ参照として残す。旧日替わり図鑑は日替わり側だけへ取り込む。

おみやげ棚は新DBでも通常と日替わりで共通の3枠とし、旧shatekki.souvenirs.v1を初回だけ読み取る。保存対象は確定済み結果のrunIdと獲得種類から検証する。slotRevisionを照合し、他タブが先に入替えた場合は最新の棚を見せて選び直す。旧版側の棚は上書きしない。新しいSharedSouvenirRepository.place(input: { runId: string; typeId: PrizeTypeId; slot?: number; expectedRevision: number }): Promise<PlaceResult | { ok: false; reason: 'conflict'; current: SouvenirShelf }>を使い、現在の確定結果を同じtransactionで読み直す。

### 2.3 品替えの幾何情報

新規src/sim/transform-placement.tsにcandidateTransformPose(subject: TransformSubject, oldShape: CollisionShape, newShape: CollisionShape, support: TransformSupport | null, policy: TransformPolicy): Poseを作る。TransformPolicyはpreserve-center / preserve-supported-bottom、TransformSupportは{ surfaceId: string; topY: number }。棚の水平範囲と下端の距離（許容0.01m）を確認した支持面だけを渡す。

r005以降では、棚に接していることを確認できる景品だけ、現在の回転を含む外接箱の下端を保つよう新しい中心Yを計算する。mountedという印だけで支持を決めない。落下中・支持不明は旧姿勢を維持。静的な棚・隣の景品・上の棚と重なれば、候補順を変えずに延期する。許容重なりは既存0.01mを使い、無断で緩めない。

AppliedKindChangeへposeAfter: Poseを追加し、world.tsのretype、body/collider、保存ShelfState、描画へ同じ値を渡す。種類を変えてもinstanceId・homeSlot・速度・回転・耐久割合を保持する。周期運動の種類・周期・振幅・位相は旧motionTypeIdから読み、接地の計算に使うshapeは現在のtypeIdから読む。この二つを一つのPrizeRuntimeConfigとして流用しない。

src/sim/motion.tsにmountedPoseForShape(base: Pose, motion: PrizeRuntimeConfig['motion'], currentShape: CollisionShape, motionSec: number): Poseを追加する。横移動・上下動・回転の位相を保ち、swingの下端を上げる計算には新しい形の半幅・半高を使う。元のmountBasePoseも現在形状の支持高さから再計算する。変身瞬間に姿勢を保つための基準差分はPrizeInstanceStateの新規motionAnchor: { base: Pose; motionTypeId: PrizeTypeId }へ保存し、syncShelf・updateMounted・描画で同じ計算を使う。未保存なら旧版の従来経路を使う。

支持面・上棚・隣への干渉は、運動の全振幅・角度範囲で取り得る外接領域を候補決定時に計算して検査する。隣も動く場合は双方の全領域を比較する。安全な領域が重なる候補は延期するため、実際には位相の違いで当たらない候補も延期され得る。この保守的な判定を初期仕様とし、成立件数への影響はS08で測る。異なる周期の最小公倍数まで延々と計算する方式は使わない。角度の端と外接寸法の極値を含める単体試験と、一周期・異周期の複数周・保存復帰の実行試験を分ける。支持面についてはcurrentShapeから各tickの下端を保つ。変更しても新運動の種類へ切り替えず、新規補充でだけ新種類の運動を使う。幅の広い形への変身、傾きの極値、保存復帰後の下端と姿勢をR06へ加える。

### 2.4 表示とゲーム内時刻

保存成功通知は新規src/contracts/persistence.tsで次の二つに分け、src/view/reward-motions.tsと既存reward-panelへ渡す。書込用関数を渡さない。

    type ConfirmedPresentation =
      | { kind: 'shot'; runId: string; shotId: string; summary: ShotSummary;
          freshSets: readonly SetId[]; replayed: boolean; reducedMotion: boolean }
      | { kind: 'perfectLoad'; runId: string; shotNumber: number; operationId: string;
          load: LoadResult; replayed: boolean; reducedMotion: boolean };

P5はSTOP_LOADの保存成功から、その装填のoperationIdとLoadResultを受ける。初射にはShotSummaryがないため前射の要約を流用しない。shotはrunId/shotId、perfectLoadはrunId/operationIdで重複を抑える。

P1の小札→袋、P3の実際に得たコルク→弾入れ、P5の刻み合わせは、入力を覆わずpointer-events:noneで描画する。大きな場面の優先は初発見→最終弾から続行→まとめ取り。音も同じ選択結果から1回だけ鳴らす。省略・動きを減らす設定・音量0でも札の個数・名前・残弾・理由は残す。演出終了を次の入力条件にしない。

日替わりの比較は、同じ実時間のタップではなく、ゲーム内の同じ刻みの入力を使う。new FixedGameClock(stepSec)のadvance(rawDtSec, paused): readonly number[]で進めるtick列を返し、stepSecは既存tuning.limits.fixedStepSecを読む。新内部版では装填・手ブレ・周期運動・物理を同じtickで進める。保存待ち・非表示・横向き・質問待ちはtickを進めず、復帰時の実時間を加算しない。r006のframeでは旧MAX_FRAME_DTによる切捨てと二重の時計加算を通らず、同じstepSecでcontrollerとworldを進める。描画中の余りは保持し、停止へ入るときは実時間の残りを破棄する。比較用入力はtickと同tick内の連番、GameCommandを持つ。これは試験のための入力列で、利用者向け全リプレイ機能は追加しない。

## 3. 工程と単独所有

仕様・保存・統合済みの判定修正はChatGPT、美術・演出・音はClaude、共有型・起点・CIの統合は既存規約の統括が単独で担当する。希望モデルと実際に使えるモデルを区別し、無断でClaudeの担当モデルを変更しない。この文書PRではChatGPTが文書だけを編集する。

実装の順序：S00→S01→S02。S03はS00後に並行できる。S04はS02の確定通知が決まってから、S05はS02後、S06はS02〜S05の統合後。S07の翻訳確認は並行可、実機の最終記録は統合後。S08→S09。S10は工程ごとに更新する。同じsrc/app.ts・contracts・world.tsを複数担当が同時に編集しない。

### S00：新内部版と比較用ビルドを用意する

**Files:** 新規data/expansion-v2/next-profile.json。変更src/contracts/expansion.ts、src/catalog/gameplay-config.ts、src/app/bundle.ts、package.json、playwright.config.ts、.github/workflows/ci.yml、scripts/ci/plan.mjs。試験tests/unit/app-bundle.test.ts、tests/unit/gameplay-bundle.test.ts（新規）、tests/ci/plan.test.mjs、tests/ci/browser-env.test.mjs。

**Interfaces:** 最初はgetGameplayBundle('expanded-save-trial')でr004を生成し、方針はatomic/preserve-center/frameに固定する。build:save-trial / preview:save-trialはdist-save-trialと4176番、成果物はinternal-save-trial-distを使う。S03でr005、S05でr006のbuild/preview/成果物/サーバー定義を同じ方式で追加する。

- [ ] r004の版・全10報酬・36枠・prototype、旧3版の同一値、URLから切替不可を検査し、追加前の失敗を記録する。
- [ ] 上記キーと固定設定を追加し、既存のデータ数・配点・弾数を変えていない差分を残す。
- [ ] CIにinternal-save-trial-distのbuild/upload/downloadを一式追加。CI_PREBUILT=trueでも4176の起動に必要な成果物が届くようにする。
- [ ] npm run test:unit -- tests/unit/app-bundle.test.ts tests/unit/gameplay-bundle.test.ts と node --test tests/ci/plan.test.mjs tests/ci/browser-env.test.mjs、npm run typecheckを実行し、0失敗・0skipを確認する。
- [ ] build、build:expanded、build:rewards、build:save-trialを確認してPRへ記録する。公開用distに内部のデータ・入口が入らない試験を維持する。Commit: feat: add isolated next gameplay bundle。

### S01：一括保存と復帰の部品を作る

**Files:** 新規src/contracts/persistence.ts、src/persistence/indexed-run-repository.ts、src/persistence/legacy-import.ts、tests/integration/atomic-persistence.test.ts、tests/e2e/atomic-persistence.spec.ts。変更src/persistence/keys.ts、src/persistence/souvenirs.ts、src/persistence/index.ts。

**Interfaces:** §2.2のRunRepositoryとcreateIndexedRunRepository(factory: IDBFactory, writerId: string): Promise<RunRepository>。旧RunStoreの同期APIは旧版用に残す。保存できない版には同じ契約のメモリ実装を用意するが、profiles/souvenirsへの永続書込みは接続しない。

- [ ] R01〜R03の失敗例を先に作る。実ブラウザの同一origin・同一BrowserContextの2ページで、同じrevisionを読み、発射・終了保存を競合させる。
- [ ] transaction内のreceipt照合→未実行時の所有者とrevision照合→全更新→oncompleteの応答を実装する。成功済みreceiptの再取得、異なる内容の重複拒否、blocked/versionchangeを含める。
- [ ] 初回import、旧キー不変、図鑑の差分、日替わり分離、3枠の入替競合を実装し、容量不足では全体が元の状態に残ることを確認する。
- [ ] npm run test:integration -- tests/integration/atomic-persistence.test.ts、npx playwright test tests/e2e/atomic-persistence.spec.ts --project=iphone-portrait-chromiumを実行する。容量不足は例外を投げる模擬だけで合格にせず、実IDB transaction.abort後の再読込も確認する。Safariの実容量不足はS07へ残す。Node側の試験は保存前の検証・差分計算・応答契約を対象とし、NodeにindexedDBがあるとは仮定しない。transaction本体の合否は実ブラウザで判断する。
- [ ] 再試行・保存後reload・2タブの勝敗・旧キーの前後比較を記録しコミットする。Commit: feat: commit run and profile records atomically。

### S02：発射・確定・結果を保存成功後につなぐ

**Files:** 変更src/app/controller.ts、src/app.ts、src/persistence/profile-store.ts、src/persistence/profile-versions.ts、src/core/session.ts。新規src/app/persisted-session.ts、tests/integration/persisted-controller.test.ts、tests/e2e/persisted-gameplay.spec.ts。変更src/i18n/の既存15言語、src/ui/controls/panel.ts。

**Interfaces:** GameplayController.dispatchPersisted(input: unknown): Promise<'applied' | 'rejected' | 'retryable' | 'conflict'>を新内部版で使用する。従来dispatch(input): booleanは旧版用に保持し、新内部版の永続化対象コマンドがこの入口から抜けないよう拒否する。アプリ側のsendGameCommandで呼出し先を一本化する。保存中のbusyはゲームのPhaseを流用せず別状態で表示する。

- [ ] R01〜R05を実アプリ経由で再現する。発射保存失敗時はworld.fire呼出し0・発射音0・残弾不変、成功後は全て1回だけであることを確認する。
- [ ] 状態候補を計算→保存→現在状態へ採用→物理を始める順にする。保存中は入力とframeの進行を止め、待ち時間を後で加算しない。
- [ ] settleの候補をcommitShotへ渡し、成功後だけsyncShelf・onShotSettled・present・結果切替を実行する。app.tsのdiscoverSets、recordRunEnd、saveResultMeta、runStore.clearを新経路から外し、保存済み値で結果を描く。
- [ ] 「再試行」「この画面だけで遊ぶ」「他の画面で進行中」の15言語案内と、reload時の読み取り専用結果を接続する。保存中に非表示・横向きになった場合は、保存が済んでも自動発射せず停止理由を保持する。
- [ ] npm run test:integration -- tests/integration/persisted-controller.test.ts と npx playwright test tests/e2e/persisted-gameplay.spec.ts tests/e2e/rewards.spec.tsを実行。旧版の同じ操作結果も維持してコミットする。Commit: fix: gate gameplay on committed checkpoints。

### S03：底を保つ品替えを実装する

**Files:** 新規src/sim/transform-placement.ts。変更src/sim/transform-plan.ts、src/sim/world.ts、src/sim/motion.ts、src/contracts/game.ts、src/contracts/expansion.ts、src/core/session.ts、src/view/prizes.ts。r005の登録はS00と同じdata/expansion-v2/next-profile.json・bundle・package・Playwright・CIとその選択試験へ追加する。試験tests/unit/expanded-transforms.test.ts、tests/integration/expanded-layout-world.test.ts、新規tests/integration/transform-bottom.test.ts。

**Interfaces:** §2.3のcandidateTransformPose、mountedPoseForShape、AppliedKindChange.poseAfter。createShotWorldのoptionsへtransformPolicyを追加し、旧版とr004はpreserve-centerを既定にする。r005（expanded-placement-trial、atomic/preserve-supported-bottom/frame）を登録し、build:placement-trial / preview:placement-trial、dist-placement-trial、internal-placement-trial-dist、4177番を追加する。

- [ ] R06の「低い景品→高い景品」「高い→低い」「上の棚が近い」「落下中」「傾いた景品」「mounted周期運動」を先に失敗させる。
- [ ] 支持の判定と候補姿勢を算出し、その姿勢で隣・上棚との重なりを検査する。候補が全て入らなければ同じ候補順で延期する。
- [ ] 物理の再生成・保存・描画・周期運動の基準へ同じ補正を渡す。耐久割合、速度、ID、元の棚番号と運動位相を保つ。
- [ ] npm run test:unit -- tests/unit/expanded-transforms.test.ts、npm run test:integration -- tests/integration/transform-bottom.test.ts tests/integration/expanded-layout-world.test.tsを実行。旧版の中心固定試験は残し、新版の底一致と分けて検査する。
- [ ] 同じ配置でr003/r004/r005の延期件数と理由、復帰前後の底の位置を比較してコミットする。Commit: fix: preserve supported prize bottoms in next rules。

### S04：残る演出と装置を仕上げる

**Files:** 新規src/view/reward-motions.ts。変更src/view/reward-props.ts、src/ui/reward-panel.ts、src/ui/expanded.css、src/audio/engine.ts、src/audio/sounds.ts、src/app.ts、src/contracts/ports.ts。新規tests/unit/reward-motions.test.ts、tests/e2e/reward-motions.spec.ts。既存tests/unit/reward-panel.test.ts、tests/unit/audio.test.tsを使用する。

**Interfaces:** ConfirmedPresentationを受けるpresentRewardMotion(input): void、dispose(): void。再表示のreplayed=trueは文字だけにする。報酬の実増加はsummaryを読み、見た目側で再計算しない。

- [ ] R07〜R08の重複通知、同時初発見・補給、上限で+0、0音量、省略、途中で画面を閉じる場合を確認する。
- [ ] P1・P3・P5の未実装部分と、P4の実変化／延期／次射予約の区別を仕上げる。繰返しrenderで音と動きを発生させない。
- [ ] 風鈴・貯金箱・シーソー・二重丸・袋を既存の屋台美術へ合わせる。判定形状と目に見える狙い所を一致させ、配置を変える場合は新しい版の設定に残す。
- [ ] npm run test:unit -- tests/unit/reward-motions.test.ts tests/unit/reward-panel.test.ts tests/unit/audio.test.ts と npx playwright test tests/e2e/reward-motions.spec.tsを実行。402×874・402×700・375×600の前後画像を保存し、操作面を覆わないことを目視する。
- [ ] 60回の場面切替後に演出要素と音源が残らないことを確認しコミットする。Commit: feat: finish reward motion and stall props。

### S05：日替わりの一射全体を再現可能にする

**Files:** 新規src/core/game-clock.ts、tests/integration/daily-determinism.test.ts、tests/e2e/daily-next.spec.ts。変更src/core/daily.ts、src/core/expanded-run.ts、src/app/controller.ts、src/app.ts、src/persistence/keys.ts。r006の登録はS00と同じdata/expansion-v2/next-profile.json・contracts・bundle・package・Playwright・CIとその選択試験へ追加する。既存tests/unit/souvenir-daily.test.tsも使用する。

**Interfaces:** r006（expanded-next、atomic/preserve-supported-bottom/fixed）を登録し、build:next / preview:next、dist-next、internal-next-dist、4178番を追加する。FixedGameClock.advanceと、試験用入力{ tick: number; sequence: number; command: GameCommand }。RunRepositoryへgameTickとstartedDateJstを保存する。入力は同tick内でsequence順に適用してからそのtickを1回進める。

- [ ] R09〜R10として同じ日・版・入力を別runId、ja/en/th、描画間隔1/60・1/30・0.1秒で流し、各射の棚・質問・効果・獲得品・得点・残弾・抽選状態を照合する。
- [ ] 時計を統一し、pause・質問待ち・保存待ちで余った時間を持ち越さない。日付は開始時だけ端末時刻から日本時間へ変換する。
- [ ] 23:59開始→翌00:01再開では元の日、翌日の新規開始は新しい日になること、通常の自己ベスト・図鑑・送信待ちが不変であることを実ブラウザで確認する。
- [ ] npm run test:unit -- tests/unit/souvenir-daily.test.ts、npm run test:integration -- tests/integration/daily-determinism.test.ts、npx playwright test tests/e2e/daily-next.spec.tsを実行する。
- [ ] 不一致があればどのtickから違うかを記録して直し、同じ比較を再実行してコミットする。Commit: fix: make daily runs independent of rendering cadence。

### S06：残る境界試験と44条件の記録を補う

**Files:** 変更tests/integration/expanded-acceptance.test.ts、tests/integration/expanded-checkpoint.test.ts、tests/unit/transform-grace.test.ts、tests/e2e/expanded-gameplay.spec.ts、docs/qa/expanded-gameplay-evidence.md。新規tests/integration/next-acceptance.test.ts、docs/qa/post-pr23-evidence.md。必要な選択規則をscripts/ci/plan.mjs・tests/ci/plan.test.mjsへ追加する。

**Interfaces:** 本物のcontroller→world→settlement→保存→表示の経路を使う。新規next-acceptanceはS01〜S05の公開された入口を呼び、内部の値を直接書き換えて成功を作らない。

- [ ] R11：品替え後の既存景品は旧運動、新規補充は新種類の運動。景品が別枠を塞ぐと補充を延期し、空いてから指定シリーズを補充する。
- [ ] R12：追加効果を含む射でも落下猶予は1回で終わり、画面外の獲得・2/3景品同時成立・最終弾の補給・終了が一度だけ確定する。
- [ ] R13：名前・音・言語・旧自己ベスト・図鑑・送信待ちを保存前後で比較し、試作・日替わり・記録なしからランキング通信0件・キュー追加0件を確認する。新しい回の成立セットは空に戻る。
- [ ] npm run test:integration -- tests/integration/next-acceptance.test.ts tests/integration/expanded-acceptance.test.ts tests/integration/expanded-checkpoint.test.ts、npm run test:unit -- tests/unit/transform-grace.test.ts、node --test tests/ci/plan.test.mjsを実行する。
- [ ] CH-AC01〜44を全件、対象SHA・版・試験名・結果・未確認条件へ更新する。旧31/13の集計を固定せず、新記録から再集計する。Commit: test: close expanded gameplay coverage gaps。

### S07：iPhone実測と15言語の表示確認

**Files:** 更新docs/qa/iphone-checklist.md、docs/qa/expanded-performance.md。新規docs/qa/post-pr23-iphone.md、docs/qa/post-pr23-locales.md。変更playwright.config.ts、tests/e2e/long-text.spec.ts、tests/e2e/reward-motions.spec.ts。新しい固定文はsrc/i18n/の既存ファイルへ追加する。

**Interfaces:** 記録は端末・OS・Safari版・対象SHA・ルール版・日時JST・URL・実測表示寸法・操作・期待・実際・画像/動画・未確認理由を持つ。S07の実機確認前に、以下の確認ページを準備する。今回の文書PRでは配信しない。

確認先の案は既存GitHub Pagesの /shatekki/preview/rules-v2-proposed-r006/。URLを知る人は開ける公開ページであり、非公開とは説明しない。新規scripts/release/prepare-next-preview.mjsと.github/workflows/preview-next.ymlの別PRを用意する。最新mainの対象SHAから同じ実行内でofficial-v1を通常のbaseで、r006だけを確認用下位パスのbaseでビルドし、それぞれsite-dist・internal-next-preview-distとして保存する。通常のinternal-next-distをそのままコピーしない。対象SHAの必要な試験の成功を確認してから、site-distをルートへ保ち、internal-next-preview-distだけを下位パスへ組み込む。URL直入力・画像・音・再読込の自動確認を行う。配置用成果物はsite-review-distとして区別し、通常のpages.ymlが内部用成果物を配信しない条件は残す。

統括が対象SHA・成果物・公開範囲・期間・費用条件・戻し方をそろえ、利用者の確認ページ公開判断後に配信段階を起動する。準備と配信は別jobにし、準備だけで公開しない。既存GitHub Actions/Pagesの利用枠内を前提とし、追加費用が発生する場合は先に判断を得る。公開処理は既存pages-mainと同じ排他グループを使い、直前にmainが同じか再確認する。通常のmain配信で確認用パスがなくなる場合は、その確認先が終了したと記録し、新しい版を勝手に再公開しない。確認終了時はその時点の最新正式版の成功site-distを再配信して確認用パスを外し、古いmainへ巻き戻したりゲームの保存データを消したりしない。

同じorigin上の下位パスでもlocalStorage/IndexedDBは共有されるため、新しい版のキー分離と旧キー不変をこの確認先で確かめる。別originの代替先を使った確認は、旧保存引継ぎの合格に代えない。確認先が用意できなくてもS08の自動比較と採用候補資料は進める。R14〜R16が未確認のままS09の「公開準備完了」にしない。

- [ ] R14：402×700の自動確認を追加し、既存402×874・375×600を残す。iPhoneで縦、短い表示、横向き停止→縦復帰、アプリ切替、質問中reload、保存待ち中の切替を確認する。
- [ ] R15：左右端・上下段・店主・36マス・全5装置、長い2択、値札・縁色・記号、的の見た目と命中位置を指で確認する。
- [ ] R16：同じ通しプレイで飛行中の36景品・36マス・最大8コルクと、確定後の多獲得・初発見・複数札の場面を別々に測る。各60秒以上、連続3ゲームの測定条件・コマ間隔・発熱・音切れを記録。目標60fps、30fpsを割る区間を報告し、未達なら調整後に同条件で再測定する。
- [ ] R19：15言語で最長の質問・選択肢・効果理由・セット名・保存案内を表示する。npx playwright test tests/e2e/long-text.spec.ts tests/e2e/reward-motions.spec.tsで切れ・重なり・操作を確認し、人の確認では増減の意味と用語を照合する。母語話者確認の有無を言語ごとに残す。
- [ ] 音オン・オフ・音量0・背景復帰・動きを減らす設定と、Safariの保存不能・DB再開を確認する。実機を使えなければ自動試験完了と実機未完了を分けて記録し、他の工程を続ける。Commit: docs: record device and locale acceptance evidence。

### S08：バランスを比較して採用候補を作る

**Files:** 新規tests/integration/next-balance-probe.test.ts、docs/qa/post-pr23-balance.md、docs/release/expanded-adoption.md。変更docs/qa/expanded-balance-probe.md、docs/design/tuning-log.md、必要時は新しい内部版の設定ファイル。

**Interfaces:** tests/integration/expanded-balance-probe.test.tsのSEEDS=(i+1)*7919（i=0〜23）と同じ打ち手方針を、共通の試験用関数へ抽出して使う。Nodeから直接TypeScriptを読む新しいmjs実行方式は増やさず、既存Vitestの実行環境で測る。版ごとにseed・shots・duration・collected・pairSets・tripleSets・rewardId別tried/achieved/offered/granted/capped・zones・transformDeferredReasonを出力する。実装のない検証用シミュレーターへ置き換えない。

- [ ] R17：official-v1、r001、r002、r003の基準を記録し、r004・r005・r006と同じ24通りで比較する。旧計画の4版比較を残したうえで新版を追加する。
- [ ] 人の試遊は「景品を狙う」「補給を狙う」を各版で分け、開始前に試遊者数・回数・対象版を記録する。自動プレイの数字から人の成立率を断定しない。
- [ ] R18：2景品50点を含むセット点、200問・400択、20シリーズ・100効果、36枠と装置配置、保存と15言語について、C01〜C05ごとに現値・候補値・比較結果・推奨理由を記載する。特定の成功率を根拠なく正式目標にしない。npm run test:integration -- tests/integration/expanded-balance-probe.test.ts tests/integration/next-balance-probe.test.tsを実行し、0失敗・弾数整合・有限時間で終了を確認してJSON出力を記録する。
- [ ] 値を調整する場合は別の内部ルール番号で固定し、同じ入力で再比較する。弾上限・既存100景品/3景品100組・既存記録を変えない。
- [ ] 採用候補と残る実機・翻訳確認をレビュー可能な状態へそろえる。利用者の具体的な採用記録が得られるまでapprovedにしない。Commit: docs: prepare measured expanded rule adoption。

### S09：正式切替の別PRと配信後確認

**Files:** 新規data/release-approved-v2.json、docs/release/official-v2.md。変更src/catalog/release-config.ts、src/catalog/gameplay-config.ts、src/app/bundle.ts、src/contracts/expansion.ts、tests/unit/release-config.test.ts、tests/unit/app-bundle.test.ts、公開用画面試験。実装時に正式版の入口を追加し、旧official-v1も復元用に残す。

**Interfaces:** approved snapshotはS08で採用されたデータ一式・ルール番号・source commit・値の出所を保持する。ランキング公開・実験場連携はfalseのまま。今回の保存改修は端末内であり、Supabaseの変更をこの工程に混ぜない。

- [ ] R20：S01〜S08の合否・未確認・採用記録を一覧にし、公開する版と対象URL、旧版へ戻すPR、旧記録の保護を具体化する。
- [ ] 採用と公開の明示判断後だけ、新しい正式スナップショットと公開用既定を変更するPRを作る。計画PRのマージをその判断の代わりにしない。
- [ ] R21：新正式版と旧版をビルドし、試作スコアの昇格なし・全10補給・36枠・15言語・名前/ランキング非表示・通信0件を確認する。変更に必要な全経路を一度検証する。
- [ ] 利用者のマージ後、最新main SHA・同じ成功CI実行・site-dist成果物番号・Pages配信先を照合する。文書だけでビルドが省略された実行を配信成功に数えない。
- [ ] 公開URLを開き、36枠・開始→一射→結果→再プレイ・共有URL・音・保存復帰を確認する。失敗時は既定をofficial-v1へ戻すPRで対応し、新旧の記録は消さない。Commit: release: publish approved expanded rules privately ranked。

### S10：資料と過去のIssueを現状へ合わせる

**Files:** README.md、docs/release/follow-up-status.md、docs/release/expanded-gameplay-readiness.md、docs/open-items.md、docs/architecture/task-ledger.md、docs/qa/post-pr23-evidence.md、docs/handoff/to-chatgpt/の既存メモへの追記または返信。

**Interfaces:** 機能ごとの状態を「未実装／内部実装済み／自動確認済み／実機確認済み／正式採用済み／配信確認済み」で区別する。過去の記録は履歴として残し、現在の参照先を先頭へ置く。

- [ ] R22：PR #21〜#23の実装済み分と最新配信結果を反映し、未翻訳5言語・古い配信待ちを現在の残件から外す。
- [ ] 古い仕様確認4件のうち、底固定はS03、残り3件は旧計画C03で採用した案と実装を照合し、判断済み／未実装／確認待ちを混ぜない。
- [ ] Issue #1・#2の「リポジトリが空・ファイル化待ち」は歴史的記述として扱い、後続のPRと要件ファイルへの対応を確認して整理案を作る。今回の文書PRでIssueを閉じない。
- [ ] リンク、10項目の追跡先、各工程の証拠を確認してコミットする。Commit: docs: reconcile post-PR23 completion status。

## 4. 確認番号と完了条件

| ID | 合格にするための証拠 |
|---|---|
| R01 | 発射保存失敗では残弾不変・world.fire=0・発射音0。再試行成功でそれぞれ1回 |
| R02 | 同じ操作の再試行、応答消失後のreload、確定中abortで重複0。receiptは古いrevisionでも読めるが権限を戻さず、最新表示を巻き戻さず、発射を再実行しない |
| R03 | 開始・発射・確定の競合で勝者1件。非所有者は最新tokenを読んでも書けない。敗者のreadは勝者を中断させず、遅れた通知・旧ownerの書込も拒否 |
| R04 | 最終確定の前後・約0.9秒の切替前後・図鑑復帰で結果と全効果が一致。再表示で書込み・音0。終了/中断済み結果を別writerで再読込→明示的に閉じる→新規開始でき、閉じる競合と進行中へのcloseは拒否 |
| R05 | 記録なしプレイの進行・図鑑・自己ベスト・棚・ランキング・送信待ちへの永続書込み0 |
| R06 | 支持ありの底一致、支持不明/落下中の姿勢維持、重なり時の延期。幅変更後のswing全周期と保存復帰で下端・姿勢が一致 |
| R07 | P1/P3/P5が発生し、P4が適用・延期・予約を区別。実増加だけを表示 |
| R08 | 大演出1場面、無音・音量0・省略・動きを減らす場合も値と操作可能時刻が一致。要素の後始末 |
| R09 | 同じ日・版・tick入力で、別runId・3言語・3描画間隔の各射の意味上の結果が一致 |
| R10 | 日跨ぎ再開は開始日、新規は当日。通常と日替わりの進行・ベスト・図鑑・送信待ちを混ぜない |
| R11 | 品替え後と補充後の運動の区別、延期景品による空き枠占有の保持 |
| R12 | 落下猶予は1回・有限、画面外を含む同時成功と最終弾の続行/終了が一度だけ確定 |
| R13 | 旧保存内容が不変、試作・日替わり・記録なしの通信0、新しい回で成立状態が空 |
| R14 | iPhoneで短い縦・横向き復帰・アプリ切替・質問と保存中のreloadを確認 |
| R15 | 両端・上下段・店主・装置・背景を指で狙え、文字・選択肢・印が読める |
| R16 | 実機の飛行中/確定後の負荷・発熱・音を測定し、30fps未達は未達として残す |
| R17 | 旧版と内部版の同条件比較・人の狙い別試遊を別データとして保存 |
| R18 | C01〜C05の値・内容・推奨理由・利用者の採用状況を対応付ける |
| R19 | 15言語の全必要項目・最長表示・意味の確認範囲と未確認範囲が分かる |
| R20 | 正式化前の合否・採用・公開の範囲が明記され、旧値と試作得点を保護 |
| R21 | 承認後の新正式版が最新mainの同じ成功成果物で配信され、実URLでも確認済み |
| R22 | 最新状態・履歴・未確認・Issue対応を分け、リンク先と実態が一致 |

## 5. PRの分け方と試験を繰り返さない方針

実装PRは、A：S00〜S02の保存（r004）、B：S03の品替え（r005）、C：S04の演出、D：S05〜S06の時計・通し確認（r006）、E：S07〜S08の確認先準備・記録・調整、F：承認後のS09を目安に分ける。Cで判定形状や配置を変更する場合は独自の次の内部番号を取り、以降の番号を衝突しないよう繰り下げる。依存するPRの起点を固定し、先行PRがマージされたら差分を見直す。S10は対応するPRに同梱する。

文書だけの今回のPRは、リンク・追跡表・状態表記・差分範囲と既存CIの文書判定を確認する。ゲームの全試験を再実行しない。実装時は関係する単体・統合・画面試験を選ぶ。ただし共有型・保存・確定順の変更は全経路へ影響するので、既存plannerがfullを選ぶことを無理に狭めない。画面・音・翻訳だけの変更でも、新規reward-motions等の必要試験が既存の狭い選択表から漏れないよう同じPRで更新する。

最終統合では公開版と内部版を一度そろえて確認する。同じSHAの成功結果があれば、変えていない試験をもう一度走らせない。失敗の修正は対象試験とその影響先で確認する。試験件数0・skipだけ・起動できなかった状態を合格にしない。

実機・母語話者・公開判断など実行担当だけでは得られない証拠は、未確認として担当・必要な記録・次の行動を残す。自動確認と同一視しない。独立に進められる実装・資料・検証は続ける。

[敵対的検証と反映記録](../../reviews/2026-11-14-post-pr23-completion-review.md)

実装上の参照：[Indexed Database API 3.0（W3C作業草案、2026年10月30日）](https://www.w3.org/TR/2026/WD-IndexedDB-3-20261030/)。transactionの完了・中断・更新競合の説明を確認した。草案の存在をiPhoneでの対応確認の代わりにはしない。
