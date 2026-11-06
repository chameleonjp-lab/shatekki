# Translation notes (Task 15 content)

Scope: prize names (P001-P100), set names (S001-S100) and set hints (S001-S100) for the 13 locales
`es, pt-BR, zh-Hans, fr, de, ko, ru, it, zh-Hant, id, tr, vi, th`. Data lives in `src/i18n/content/<locale>.ts`;
`ja` stays in `data/catalog-candidates.json` / `src/i18n/hints.ts`, `en` in `src/i18n/content-en.ts`.

## Status (open item O16)

- All translations are machine-produced by Claude (Sonnet 5.5). **No native speaker has reviewed any of them.**
- The Japanese hints they translate are still prototype riddles (O02, `HINT_IS_PROTOTYPE`), unapproved by the user.
  If the Japanese hints change, the 13 hint sets must be redone.
- Hints point at the theme without naming the set; a test checks no hint contains its own set name.
- "セット" is rendered as the local word for "set/kit/lot" (es/it/de "Set", pt-BR "Kit", fr "Lot", ru "Набор",
  id "Set", tr "Seti", vi "Bộ", th "ชุด", ko "세트", zh "套装/套組"). Easy to change globally.
- Tests (`tests/unit/i18n-content.test.ts`) check completeness, script/language sanity, no kana outside ja, no
  English copies (only "Kendama" in Latin-script locales is allow-listed, as the international loanword),
  zh-Hans != zh-Hant, uniqueness. They cannot check meaning or naturalness.

## Policy for Japanese festival / culture items

Established local term where one exists, otherwise a short descriptive phrase or the romanized loanword:
ramune (kept as "ramune"; ko 라무네, ru рамунэ, th ราซึเนะ, zh 波子汽水 / 彈珠汽水), onigiri (kept in Latin scripts;
ko 주먹밥, zh 饭团/飯糰), dango (kept in Latin scripts; zh 丸子/糰子, ko 경단, th ดังโงะ), kendama, tamagoyaki
(de/vi/it use a descriptive phrase; zh 玉子烧/玉子燒), candy apple / cotton candy / wind chime use the local common name.
"食品模型" (plastic food sample) is rendered as "de muestra / de vitrine / factice / Schaumodell / mô hình / 模型" etc.

## Terms the translator was unsure about

- es: "de muestra" for food replicas (could be "de plástico"); "Set" vs "Conjunto"; "gominolas" (Spain) vs "gomitas" (LatAm); "patatas fritas" (Spain) vs "papas fritas" (LatAm). Spain-leaning vocabulary overall.
- pt-BR: "de vitrine" for food replicas is unusual (maybe "réplica de"); "ioiô de água" / "balão ioiô"; "Kit" chosen over "Conjunto".
- fr: "factice" for food replicas; "Lot" for the sets (could be "Kit"/"Ensemble"); "barbe à papa", "pomme d'amour" are the local festival terms.
- de: "Schaumodell" for 食品模型 (maybe "Attrappe"); "Liebesapfel", "Windspiel" for 風鈴 (Furin are glass bells; "Windglocke" is also used); hyphenated set names ("Snack-Set") are a stylistic choice.
- ko: "경단" vs "당고" for dango; "켄다마"; "본오도리" for 盆踊り; "풍경" for 風鈴 (traditionally a temple bell; "윈드차임" is the common modern word).
- ru: "Музыка ветра" was avoided; used "ветряной колокольчик"; "кэндама", "рамунэ", "данго" are transliterations with no settled Russian term; "Набор «…»" quoting style.
- it: "finto" for food replicas (maybe "replica"); "Set" kept; "dango", "onigiri" unchanged.
- zh-Hans: "波子汽水" (Hong Kong/Cantonese-leaning name for ramune; mainland "弹珠汽水"); "悠悠" for yo-yo balloon (水球悠悠 is a Taiwan-style term; mainland "水球溜溜球"); "剑玉" for kendama; "盂兰盆舞" for bon-odori.
- zh-Hant: Taiwan usage assumed (貓熊 for panda, 洋芋片, 公車, 太空人, 糰子); Hong Kong readers may prefer different words (熊貓, 薯片, 巴士).
- id: "Set" kept; "gula kapas" for cotton candy; "kumbang koksi" for ladybug; "rebana kecil" for tambourine is approximate; "lonceng angin" for wind chime.
- tr: "Rüzgâr çanı" for wind chime; "Yelpaze" for uchiwa (a round fan); "vitrin" (display) for food replicas; "Seti" suffix style ("... Seti").
- vi: "Bộ" for set; "trống lắc tay" for tambourine is approximate; "kẹo bông gòn" for cotton candy; "hộp cơm" for bento.
- th: "ชุด" for set; "ราซึเนะ", "เคนดามะ", "โอนิกิริ", "ดังโงะ" are transliterations; "สายไหม" for cotton candy; "แทมเบอรีน" for tambourine; "ซ่อนแอบ" for hide and seek (more commonly "ซ่อนหา").

## Follow-up

Have a native speaker per locale check names (especially cultural items), hint tone, and length on small screens before
public release; record the result against O16.

## Expanded gameplay text (EG09, part 1)

Scope: player-facing text for D34-D37 - 300 pair names/hints (PAIR001-300), 200 shopkeeper questions with A/B choices,
6 group labels, 100 effect names and result lines (FX001-100), 20 series labels/symbols (SER01-20) and four fixed lines.
Code: `src/i18n/expanded/` (types, `ja.ts`, `en.ts` + parts), resolver `src/i18n/expanded-content.ts`
(`pairName`, `pairHint`, `questionText`, `choiceText`, `groupLabel`, `effectName`, `effectResult`, `seriesLabel`,
`seriesSymbol`, `expandedLine`, `contentCoverage`). Fallback: locale -> en -> ja data -> id.

- Status (open item O16 style): all texts are machine-produced by Claude, **not reviewed by a native speaker**. The ja
  pair hints and result lines are written here (not in the data) and are prototypes like the existing set hints (O02).
- Done: ja (source texts from `data/expansion-v2/*_ja` + written hints/results/lines), en, and (batch 2) es, pt-BR, zh-Hans,
  fr, and (batch 3) de, ko, ru, it, all complete for every field (300 pair names/hints, 200 questions x text/A/B, 6 groups, 100 effect names/results, 20 series
  labels/symbols, 4 lines). Machine-produced by Claude from the Japanese meaning with English as a cross-check; **not native-reviewed**.
  Prize and set vocabulary follows the existing per-locale prize names (es "Set de ...", pt-BR "Kit de ...", zh-Hans "...套装",
  fr "Lot ..."); the ammo word follows the UI (es corcho, pt-BR rolha, zh-Hans 弹, fr bouchon, de Korken, ko 코르크, ru пробка, it tappo);
  batch 3 set words: de "Set", ko "세트", ru "Набор «...»", it "Set". Series symbols are short bracketed
  words, unique per series (es `[Dulces]`, pt-BR `[Doces]`, zh-Hans `[糖果]`, fr `[Bonbons]`, de `[Süßes]`, ko `[과자]`, ru `[Сладости]`, it `[Dolci]`). The unit test applies the same
  completeness, placeholder, symbol and hint checks (hint names neither prize of the pair via that locale's `prizeName`, says
  "2 tipos" (es, pt-BR) / "2种" / "2 types" / "2 Sorten" (de) / "2종류" (ko) / "2 вида" (ru) / "2 tipi" (it)) to every complete locale.
- Wording to review first with a native reader: the verbs for the two ammo-effect pairs "chip" and "push" (ja 削る/押す) in all
  four languages (es astillar/empujar, pt-BR lascar/empurrar, zh-Hans 削/推, fr entamer/pousser), the dango / ramune / onigiri
  loanwords kept as is, and the pair clues that stay close to the designer note.
- Batch 3 (de, ko, ru, it): machine-produced by Claude, not native-reviewed. Review first: the two ammo-effect pairs "chip" and
  "push" (de absplittern/schieben, ko 깎다/밀다, ru откалывать/толкать, it scheggiare/spingere), the dango / ramune / onigiri /
  kendama loanwords kept as is, ko register (polite 해요체 in
  questions and results; the UI uses 합니다), ru gender/case in the "Набор «...»" names, de/it set names written as "Set <scene>"
  (some read like captions rather than names), and clues that stay close to the designer note. Pending native review for all four.
- Pending (fall back to English until filled): zh-Hant, id, tr, vi, th.
  `contentCoverage()` lists per-locale counts; a pending locale may hold partial content, a complete one must hold all.
- Hints: a gentle scene/category clue plus "needs 2 kinds"; they never name both prizes and never paste the designer note.
  Some clues are close to the scene in the designer note and may still be easy to guess; review before release.
- Result lines say what happened and never promise success. `{n}` is the real amount (only FX001-003, FX021-023);
  `{series}` is the series label (FX041-080). Texts never change ids, numbers, probabilities or which effect a choice leads to.
- Series symbols: one short symbol per series in every place it appears (ja `[菓]` from data, en `[Sweets]`).
