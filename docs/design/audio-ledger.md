# 音台帳（Visual / Claude）Task 13

実装: `src/audio/engine.ts`（`createAudioEngine`）、`src/audio/sounds.ts`（音の定義と対応表）。試験: `tests/unit/audio.test.ts`（偽 AudioContext、実音は鳴らさない）。

**未実施**: 実機（iPhone Safari）での試聴、音量・音色の調整、消音スイッチ/バックグラウンド復帰の実機確認。コードと自動試験の確認であり、試聴済みではない。音色の数値は試作値。

## 共通の動作

| 項目 | 内容 |
|---|---|
| 音源 | ブラウザ合成のみ（発振器＋フィルタ付きノイズ）。外部ファイルなし、通信なし |
| 初期化 | `unlock()` を利用者操作の中で呼ぶ。AudioContext の生成・再開に失敗しても例外を出さず無音で進行。次の操作で再試行 |
| 設定 | `handle(event, settings)` が毎回 `settings` を見る。`enabled:false` または `volume<=0` は一切鳴らさない（鳴っている音も即停止）。初回既定（オン・0より大きい音量）は設定保存側 |
| 音量 | `0.8 * volume^1.6` をマスターゲインに設定 |
| 止める | `silence()`：鳴っている音・予約済みの音を全て停止し、制限用の履歴も消す。ポーズ/非表示/横向き時に app が呼ぶ（AC36） |
| 溜めない | context が `running` でない間は音を捨てる（待ち行列を持たない）。復帰時にまとめて鳴らない |
| 同時発音数 | 12。満杯時は優先度が低い古い音を止めて入れ替え、入れ替え不能なら新しい音を捨てる |
| 連打制限 | 音ごとの最小間隔（下表）。優先度0は0.12秒窓に4音、優先度1は6音まで。優先度2（UI・結果）は窓の上限対象外 |
| 重複 | `eventId` 単位で再生を一度だけにする（直近256件） |
| 音だけに頼らない | 結果・得点・当たりは全て画面にも出る。音は補助 |

優先度 0=接触の細部、1=ゲームの出来事、2=UI・結果。

## SimEvent

| イベント | 音 | いつ | 重複/優先度 | 実装 |
|---|---|---|---|---|
| `impact`（景品） | `hit.<素材>`：wood/cloth/paper/metal/plastic/glass/ceramic/rubber の8種 | 接触ごと（画面外も） | 0。最小間隔 0.04〜0.05秒。速度で音量 | `soundsForSimEvent` |
| `impact`（背景面） | `hit.<素材>`：wood/cloth/paper/metal/plastic。反射回数>0なら `reflect` も追加 | 同上 | 0。`reflect` 0.06秒 | 同上 |
| `impact`（装置・作動済み） | 無音（`deviceActivated` が鳴らす） | — | — | 同上 |
| `impact`（装置・この発で作動済み） | `hit.deviceDull`（普通の小さな反応のみ） | 接触ごと | 0 | 同上 |
| `impact`（店主） | `shop.hat` / `shop.fan` / `shop.body` / `shop.feet` | 当たるたび（反応は毎回、点は初回のみ＝決定18） | 1。0.12秒 | 同上 |
| `impact`（隠し的） | `hidden` | 同上 | 1。0.2秒 | 同上 |
| `prizeContact` | `chainTap`（小さな連鎖音） | 景品同士の接触 | 0。0.08秒 | 同上 |
| `projectileSpawned` | 無音 | 発射音は UiCue `fire` | — | `SIM_EVENT_POLICY` |
| `projectileEnded` | 無音（`split` は `deviceActivated` が鳴らす） | — | — | 同上 |
| `deviceActivated` split | `split` | 分裂板の作動 | 1。0.15秒 | `soundsForSimEvent` |
| `deviceActivated` power | `power` | 威力板の作動 | 1 | 同上 |
| `deviceActivated` transform | `transformArm`（短い仕込み音） | 景品変更板の作動 | 1 | 同上 |
| `deviceActivated` penalty | `penalty`（ブザー） | 減点札 | 1。0.2秒 | 同上 |
| `deviceActivated` ammo | `ammo`（二連コイン音） | 所持弾+2 | 1 | 同上 |
| `deviceActivated` bulletType | `bulletChange` | 弾種変更 | 1 | 同上 |
| `prizeDamaged` | 無音 | 原因の `impact` が鳴らしている | — | `SIM_EVENT_POLICY` |
| `prizeReachedCollection` | `collectDrop`（落ちる音） | 獲得ゾーン到達（暫定の生通知） | 0。0.1秒 | `soundsForSimEvent` |
| `prizeTransformed` | `transform`（きらめく上昇音） | 飛行終了後の変化 | 1。0.3秒 | 同上 |
| `shotStage` | 無音 | 段階の切替は画面の状態で十分 | — | `SIM_EVENT_POLICY` |

## UiCue

| UiCue | 音 | いつ | 優先度/間隔 |
|---|---|---|---|
| `select` | `ui.select` | 選択・移動 | 2 / 0.05 |
| `confirm` | `ui.confirm` | 決定 | 2 / 0.08 |
| `cancel` | `ui.cancel` | 戻る・取消 | 2 / 0.08 |
| `start` | `ui.start` | 挑戦開始 | 2 / 0.3 |
| `loadStart` | `load.charge`（上昇音、保持音） | 装填バー開始。`loadStop`/`fire`/`runEnd`/`resultShow`/`silence` で止まる | 1 / 0.1 |
| `loadStop` | `load.stop.perfect/good/normal/weak`（段階別） | 装填停止。段階は任意項目 `tier`（無ければ normal） | 2 / 0.1 |
| `fire` | `fire`（ポン） | 発射 | 2 / 0.08 |
| `collect` | `collect`。任意項目 `count>=2` なら `chain` を追加 | 精算後の獲得 | 2 / 0.15、chain 0.3 |
| `penalty` | `penalty` | 精算後の減点表示 | 1 / 0.2 |
| `ammoBonus` | `ammo` | 精算後の弾追加 | 1 / 0.15 |
| `setComplete` | `setComplete` | セット完成（精算後） | 2 / 0.5 |
| `setDiscovered` | `setDiscovered` | 新しく発見したセット | 2 / 0.5 |
| `nearMiss` | `nearMiss` | 精算後の分類が惜しい | 2 / 0.3 |
| `miss` | `miss` | 精算後の分類が外れ | 2 / 0.3 |
| `runEnd` | `runEnd` | 挑戦終了 | 2 / 0.8 |
| `resultShow` | `resultShow` | 結果画面表示 | 2 / 0.8 |
| `newBest` | `newBest` | 自己ベスト更新 | 2 / 1.0 |

## 契約への提案（Opus が判断）

- `UiCue` に任意項目を足す：`loadStop` に `tier: 'perfect'|'good'|'normal'|'weak'`、`collect` に `count: number`（連鎖数）。無くても動く（既定音）。engine は型 `UiCueExt` で受ける。
- `nearMiss`/`miss` は精算後でなければ送らない。`createThreeRenderer` の `onSettled(cls, summary)` が `present()` の中（精算後）で分類結果を返すので、そこで UiCue を送れる。
