# シャテッキの非公開データ保存

この手順は、採用した数値を版ごとに保存する。ゲーム結果や参加者は保存しない。ランキングを公開せず、実験場にもまだ連携しないため、`public.games`、既存の共通関数、共有スキーマの権限は変更しない。

## 保存する内容

`private.shatekki_releases` は `rules_version` ごとに1行を持つ。`value_status` は `approved`、公開・連携の2項目は `false` に固定する。ブラウザやサービス用の役割には権限を与えず、行ごとの閲覧制限（Row Level Security）も有効にして許可規則を作らない。専用トリガーが更新・削除・全件消去を拒否する。データベース所有者がトリガーを変更する操作まで防ぐものではない。

保存するJSONは、最終コードの `RELEASE_TUNING` と `RELEASE_CATALOG` から書き出す。景品は `typeId`、セットは `setId` と `requiredTypeIds` を持つ。両配列はID順に並べ、試作時の数値を変更せず、採用済みの `valueStatus` と `rulesVersion` を含める。

```json
{
  "rulesVersion": "rules-v1",
  "title": "シャテッキ",
  "valueStatus": "approved",
  "rankingPublic": false,
  "labIntegrationEnabled": false,
  "tuning": { "valueStatus": "approved" },
  "catalog": { "rulesVersion": "rules-v1", "prizes": [], "sets": [] }
}
```

上記の短いJSONは形の説明であり、登録用の値ではない。実際には景品100種・セット100種と設定全体を含める。`source_commit` には、その書き出し元を含む最終承認コードの40桁コミットを渡す。秘密鍵やプレイヤー情報は含めない。

`content_sha256` は、このJSONをPostgresの `jsonb` に変換した `::text` のUTF-8バイト列から計算する。JavaScript側のJSON文字列のハッシュではない。`source_commit` と初回登録日時 `approved_at` はハッシュに含めないが、同じ版の再登録時にはコミットも一致させる。

## 適用

先に `private` スキーマの存在と `pg_catalog.sha256(bytea)` の存在を読む。次に [database-private-v1.sql](database-private-v1.sql) を `postgres` として移行ツールで一度適用する。同名テーブルが既にあれば停止して構造を比較する。`IF NOT EXISTS` で差を隠さない。

以下は登録の骨格である。`__RELEASE_JSON__` を上記契約の完全なJSONに、`__SOURCE_COMMIT__` を最終コミットに置き換えてから、管理用SQLで一度に実行する。未置換の骨格は登録されない。JSON内に区切り文字 `$release_json$` が含まれないことも確認する。

```sql
do $seed$
declare
  payload jsonb := $release_json$__RELEASE_JSON__$release_json$::jsonb;
  commit_id text := '__SOURCE_COMMIT__';
  expected_hash text;
  saved private.shatekki_releases%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or payload ->> 'rulesVersion' is distinct from 'rules-v1'
    or payload ->> 'title' is distinct from 'シャテッキ'
    or payload ->> 'valueStatus' is distinct from 'approved'
    or payload -> 'rankingPublic' is distinct from 'false'::jsonb
    or payload -> 'labIntegrationEnabled' is distinct from 'false'::jsonb
    or jsonb_typeof(payload -> 'tuning') is distinct from 'object'
    or payload #>> '{tuning,valueStatus}' is distinct from 'approved'
    or payload #>> '{catalog,rulesVersion}' is distinct from 'rules-v1'
    or jsonb_typeof(payload #> '{catalog,prizes}') is distinct from 'array'
    or jsonb_typeof(payload #> '{catalog,sets}') is distinct from 'array'
    or commit_id !~ '^[0-9a-f]{40}$' then
    raise exception 'Invalid release envelope';
  end if;

  if jsonb_array_length(payload #> '{catalog,prizes}') <> 100
    or jsonb_array_length(payload #> '{catalog,sets}') <> 100
    or exists (
      select 1 from jsonb_array_elements(payload #> '{catalog,prizes}') p
      where jsonb_typeof(p) is distinct from 'object'
        or p ->> 'valueStatus' is distinct from 'approved'
        or not coalesce(p ->> 'typeId' ~ '^P[0-9]{3}$', false)
    ) or exists (
      select 1 from jsonb_array_elements(payload #> '{catalog,sets}') s
      where jsonb_typeof(s) is distinct from 'object'
        or s ->> 'valueStatus' is distinct from 'approved'
        or not coalesce(s ->> 'setId' ~ '^S[0-9]{3}$', false)
        or jsonb_typeof(s -> 'requiredTypeIds') is distinct from 'array'
    ) then
    raise exception 'Expected 100 approved prizes and 100 approved sets';
  end if;

  if (select count(distinct p ->> 'typeId') from jsonb_array_elements(payload #> '{catalog,prizes}') p) <> 100
    or (select count(distinct s ->> 'setId') from jsonb_array_elements(payload #> '{catalog,sets}') s) <> 100
    or exists (
      select 1 from jsonb_array_elements(payload #> '{catalog,sets}') s
      where jsonb_array_length(s -> 'requiredTypeIds') <> 3
        or (select count(distinct r) from jsonb_array_elements(s -> 'requiredTypeIds') r) <> 3
        or exists (
          select 1 from jsonb_array_elements(s -> 'requiredTypeIds') r
          where jsonb_typeof(r) is distinct from 'string' or not exists (
            select 1 from jsonb_array_elements(payload #> '{catalog,prizes}') p
            where p -> 'typeId' = r
          )
        )
    ) or (
      select count(distinct (
        select jsonb_agg(r order by r) from jsonb_array_elements(s -> 'requiredTypeIds') r
      )) from jsonb_array_elements(payload #> '{catalog,sets}') s
    ) <> 100 then
    raise exception 'Duplicate IDs, invalid prize references, or duplicate set combinations';
  end if;

  expected_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(payload::text, 'UTF8')), 'hex');
  insert into private.shatekki_releases (
    rules_version, title, value_status, ranking_public, lab_integration_enabled,
    source_commit, content_sha256, tuning, catalog
  ) values (
    payload ->> 'rulesVersion', payload ->> 'title', payload ->> 'valueStatus',
    false, false, commit_id, expected_hash, payload -> 'tuning', payload -> 'catalog'
  ) on conflict (rules_version) do nothing;

  select * into strict saved from private.shatekki_releases
    where rules_version = payload ->> 'rulesVersion';
  if saved.source_commit is distinct from commit_id
    or saved.content_sha256 is distinct from expected_hash
    or jsonb_build_object(
      'rulesVersion', saved.rules_version, 'title', saved.title,
      'valueStatus', saved.value_status, 'rankingPublic', saved.ranking_public,
      'labIntegrationEnabled', saved.lab_integration_enabled,
      'tuning', saved.tuning, 'catalog', saved.catalog
    ) is distinct from payload then
    raise exception 'Existing rules_version has different content; do not overwrite';
  end if;
end;
$seed$;
```

SQL全体が成功した場合だけ保存される。同じ版・同じ内容・同じコミットの再実行は既存行を保つ。内容かコミットが違えば例外で停止し、上書きしない。JSON内の未知の追加項目も、ハッシュ制約との不一致で停止する。

## 適用後の確認

次の結果が、`rls_enabled=true`、`policy_count=0`、`all_*_blocked=true` になることを確認する。2件目は行が返らないことを確認する。権限を外した役割以外へ既定の権限が継承されていたら、公開前に当該テーブル・関数だけを調べる。

```sql
select c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
  (select bool_and(not has_table_privilege(r, c.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    from unnest(array['anon','authenticated','service_role']) r) as all_table_access_blocked,
  (select bool_and(not has_function_privilege(r,
    'private.shatekki_release_reject_change()', 'EXECUTE'))
    from unnest(array['anon','authenticated','service_role']) r) as all_function_access_blocked
from pg_class c where c.oid = 'private.shatekki_releases'::regclass;

select 'table' as object_kind, a.grantee, a.privilege_type
from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
where c.oid = 'private.shatekki_releases'::regclass and a.grantee <> c.relowner
union all
select 'function', a.grantee, a.privilege_type
from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.oid = 'private.shatekki_release_reject_change()'::regprocedure and a.grantee <> p.proowner;

select rules_version, source_commit, content_sha256, approved_at,
  value_status, ranking_public, lab_integration_enabled,
  jsonb_array_length(catalog -> 'prizes') as prize_count,
  jsonb_array_length(catalog -> 'sets') as set_count,
  content_sha256 = encode(sha256(convert_to(jsonb_build_object(
    'rulesVersion', rules_version, 'title', title, 'valueStatus', value_status,
    'rankingPublic', ranking_public, 'labIntegrationEnabled', lab_integration_enabled,
    'tuning', tuning, 'catalog', catalog
  )::text, 'UTF8')), 'hex') as hash_matches
from private.shatekki_releases where rules_version = 'rules-v1';
```

最後の結果は1行、景品・セット各100件、`approved / false / false / hash_matches=true` と書き出し元のコミット・期待ハッシュに一致することを確認する。登録SQLを同じ入力でもう一度実行すれば、各IDの重複、採用状態、3種の参照先、セットの組み合わせの重複も再確認できる。`approved_at` と行数が変わらないことを確認する。適用後にはSupabaseの安全性診断でも追加分を確認する。

## 不具合が見つかった場合

登録済みの行を削除・上書きしない。必要ならサイトの配信を止める。修正値は新しい `rules_version` としてコード・書き出し内容を改めて確認してから追加する。過去の版とコミットを残し、今回の表のために共有データベース全体を復元しない。

参照: [Supabaseのアクセス権と行ごとの制限](https://supabase.com/docs/guides/api/securing-your-api)、[PostgreSQLの権限](https://www.postgresql.org/docs/current/ddl-priv.html)。
