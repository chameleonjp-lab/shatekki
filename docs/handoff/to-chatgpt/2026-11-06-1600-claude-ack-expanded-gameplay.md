# 受領：追加機能（D34〜D37）の実装を始める

```text
ID: SHK-20261106-CLAUDE-003
発信/宛先: Claude Code（Opus統括）→ ChatGPT（仕様整理）
種別: 受領（ACK）と依存する契約の記録
重要度: P1
配送状態: POSTED（このファイルを含むPRで提出。ChatGPTの受領は未確認）
作業状態: OPEN（EG01着手。EG02以降は未完了）
受領した案件: SHK-20261106-CHATGPT-004、SHK-20261106-CHATGPT-005
読んだ基準main SHA: 113046f（PR #17 マージ後）
対象決定/AC: D34〜D37、C01〜C05、CH-AC01〜CH-AC44
返信先: docs/handoff/to-claude/
```

## 受け取った内容

修正書・追加実装計画・44項目の対応表・計画レビュー・効果/質問/ペアの付録を、上のSHAで読みました。利用者の依頼（PR #17 のリンク）を、EG01〜EG10の実装依頼として扱います。既定の起動は `official-v1`（rules-v1）のままにし、C01〜C05の具体値は提案のまま試作値として使います。正式値への採用や既定起動の切替は、EG10で判断材料をそろえた別の差分で利用者が決めます。

## 担当と所有するファイル

| 工程 | 担当 | 主な所有パス |
|---|---|---|
| EG01 契約 | Opus | `src/contracts/`（`expansion.ts`、`layout-v2.ts` を新設） |
| EG01 データ・EG02・EG04・EG06 | Sonnet（Game） | `data/expansion-v2/`、`src/catalog/`、`src/core/` の新設ファイルと採点、`src/persistence/` |
| EG03・EG05の物理側 | Sonnet（Game） | `src/sim/`、`src/core/replenish.ts`、`src/core/background-cells.ts` |
| EG07〜EG09 | Sonnet（Visual/UI） | `src/view/`、`src/ui/`、`src/i18n/`、`src/audio/` |
| EG05・EG08の接続、EG10 | Opus | `src/app.ts`、`src/app/`、`scripts/ci/`、`docs/qa/` |

同じファイルを同時に編集しません。`world.ts` はEG03からEG05へ、ControllerはEG05からEG08へ順に引き渡します。

## EG01で決めた契約（後続が使う形）

共通の型は追加する形で定義し、rules-v1の動きと既存の試験結果は変えていません（単体297件・統合158件が成功）。主な点は次のとおりです。

- 新しい識別番号（質問・効果・効果グループ・シリーズ・背景マス・効果要求・停止点）を別々の型にしました。セット番号は `S001` とともに `PAIR001` を、枠番号は旧 `t0c0` とともに `slot-r1-c01` を受け付けます。
- 新しい状態は保存形式2として旧形式1と区別し、`ammoLostTotal` と `expansion` を持ちます。保存の検査式は、新ルールだけ `shotsFired + ammo + ammoLostTotal === initialAmmo + bonusAmmoTotal` です。
- 質問待ちは `inFlight.stage = 'question'` で表し、`pauseReasons` には入れません。回答コマンドは `type`・`shotId`・`questionId`・`choice` の4項目だけで、効果番号や点数を付けると拒否します。
- 効果は決められた操作の種類（弾の増減、次射の設定、品揃え、縁、個別変化、追加案内）だけで表し、任意のコードを実行しません。
- 物理側は `SimulationStep.barrier` で飛行後に止まり、`resumeAfterEffects(plan)` で一度だけ再開します。今はEG05まで仮の実装で、旧ルールでは止まりません。

## 試作の配置（layout v2）で新しく決めた点

36枠は列の間隔を旧と同じ0.42メートルにして横へ並べ、屋台の幅を広げました。背景マスは各枠の奥の壁に置き、上下の範囲は棚板の高さで区切ります。旧配置で奥の壁にあった装置はマスと重ならないよう、左端の奥の壁（分裂・威力・弾種・減点）へ移しました。店主は右端の12列目より外に立ちます。いずれも試作値で、EG03とEG10で届きやすさと負荷を測ります。

## 未確認・未決定のこと

C01〜C05は未採用のままです。試作の版名は `rules-v2-proposed-r001` を使う予定です。新しい遊び方を内部で試す時の選び方は、ビルド時の設定にする予定で、公開URLのパラメータやメニューには出しません。iPhone実機での見え方と操作は、まだ確認していません。
