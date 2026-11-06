/**
 * Turkish texts of the expanded gameplay (complete). Machine-written by Claude from the
 * English text, not native-reviewed. Series symbols are short bracketed words and are
 * the same for the same series everywhere.
 */
import { TR_PAIR_CLUES, TR_PAIR_NAMES } from './tr-pairs';
import { TR_QUESTIONS } from './tr-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
TR_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
TR_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. 2 çeşit gerekir.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
TR_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  '1 mantar al', '2 mantar al', '3 mantar al', 'Biraz daha aşındıran atış', 'Çok aşındıran atış',
  'Biraz daha iten atış', 'Güçlü iten atış', 'Yeterince güçlü vuruş', 'Sağlam güçlü vuruş', 'Biraz hızlı atış',
  'Hızlı atış', 'Daha sabit nişan', 'Çok daha sabit nişan', 'Biraz daha az düşüş', 'Alçak kavisli atış',
  'Sekici mantara geç', 'Ağır mantara geç', 'Daha toplu bölünme', 'İki yönlü atış', 'Bir sekme hakkı daha',
  // 021-040
  '1 mantar kaybet', '2 mantar kaybet', '3 mantar kaybet', 'Zor aşındıran atış', 'Yumuşak atış',
  'Zor iten atış', 'Hafif iten atış', 'Sade tekli atış', 'Biraz yavaş atış', 'Yavaş atış',
  'Biraz kavisli atış', 'Kavisli atış', 'Az seken atış', 'Çabuk hız kaybeden', 'Biraz titrek nişan',
  'Titrek nişan', 'Hızlı dolum çubuğu', 'Yavaş dolum çubuğu', 'Daha dağınık bölünme', 'İki sekme eksik',
  // 041-060
  'Şekerci Dükkânı dizisi', 'Çay Partisi dizisi', 'Yaz Şenliği dizisi', 'Eski Usul Oyunlar dizisi', 'Tanıdık Hayvanlar dizisi',
  'Hayvanat Bahçesi dizisi', 'Orman Manzarası dizisi', 'Deniz Canlıları dizisi', 'Yolculuk Araçları dizisi', 'İş Araçları dizisi',
  'Gezi Eşyaları dizisi', 'Uzay Keşfi dizisi', 'Gökyüzü Manzarası dizisi', 'Çiçek Bahçesi dizisi', 'Minik Böcekler dizisi',
  'Konser dizisi', 'Herkes İçin Oyunlar dizisi', 'Kahvaltı ve Beslenme dizisi', 'Atıştırma Tezgâhı dizisi', 'Oyuncak Mutfak dizisi',
  // 061-080
  'Şekerci Dükkânını işaretle', 'Çay Partisini işaretle', 'Yaz Şenliğini işaretle', 'Eski Usul Oyunları işaretle', 'Tanıdık Hayvanları işaretle',
  'Hayvanat Bahçesini işaretle', 'Orman Manzarasını işaretle', 'Deniz Canlılarını işaretle', 'Yolculuk Araçlarını işaretle', 'İş Araçlarını işaretle',
  'Gezi Eşyalarını işaretle', 'Uzay Keşfini işaretle', 'Gökyüzü Manzarasını işaretle', 'Çiçek Bahçesini işaretle', 'Minik Böcekleri işaretle',
  'Konseri işaretle', 'Herkes İçin Oyunları işaretle', 'Kahvaltı ve Beslenmeyi işaretle', 'Atıştırma Tezgâhını işaretle', 'Oyuncak Mutfağı işaretle',
  // 081-100
  'Sade atışa dön', 'Sonraki atış her zamanki gibi', 'Kalın mantar', 'İnce mantar', 'Yakın iki yönlü atış',
  'Üç yönlü atış', 'Aşındırma odaklı atış', 'İtme odaklı atış', 'Hızlı ama hafif atış', 'Bir ödülü eşleştir',
  'Bir ödülü ilk çeşidine döndür', 'Kazandığın çeşitten bir tane daha', 'Dayanıklılık haritası', 'Bir çeşit daha için ipucu', 'Bu oyunda henüz kazanılmadı',
  'Aynı çeşitleri bir arada gör', 'Hareket döngüsünü gör', 'İlk isabet tahmini', 'Uçuş yolunu göster', 'Nişan açı ölçeği',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '{n} mantar eklendi', '{n} mantar eklendi', '{n} mantar eklendi',
  'Sonraki atış biraz daha aşındırır', 'Sonraki atış daha çok aşındırır',
  'Sonraki atış biraz daha iter', 'Sonraki atış daha güçlü iter',
  'Sonraki atışın aşındırma ve itme gücü biraz artar', 'Sonraki atışın aşındırma ve itme gücü çok artar',
  'Sonraki atış biraz daha hızlı uçar', 'Sonraki atış daha hızlı uçar',
  'Sonraki atışta nişan daha az titrer', 'Sonraki atışta nişan çok daha az titrer',
  'Sonraki atış biraz daha az düşer', 'Sonraki atış alçak bir kavisle uçar',
  'Sonraki atış sekici mantarla olur', 'Sonraki atış ağır mantarla olur',
  'Sonra bölünürse yayılma daha dar olur', 'Sonraki atış iki yöne bölünür',
  'Sonraki atış bir kez daha sekebilir',
  // 021-040
  '{n} mantar kaybedildi', '{n} mantar kaybedildi', '{n} mantar kaybedildi',
  'Sonraki atış daha az aşındırır', 'Sonraki atış çok daha az aşındırır',
  'Sonraki atış daha az iter', 'Sonraki atış çok daha az iter',
  'Sonraki atış biraz daha az aşındırır ve iter',
  'Sonraki atış biraz daha yavaş uçar', 'Sonraki atış yavaş uçar',
  'Sonraki atış biraz daha kavis çizer', 'Sonraki atış yüksek bir kavis çizer',
  'Sonraki atış biraz daha az seker', 'Sonraki atış çabuk hız kaybeder',
  'Sonraki atışta nişan biraz daha titrer', 'Sonraki atışta nişan daha çok titrer',
  'Sonraki dolum çubuğu biraz daha hızlı ilerler', 'Sonraki dolum çubuğu yavaş ilerler',
  'Sonra bölünürse yayılma daha geniş olur', 'Sonraki atış iki kez daha az sekebilir',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Kalan ödüller "{series}" dizisine çevrildi. Kazanılan ödüller olduğu gibi kalır'),
  // 061-080
  ...Array.from({ length: 20 }, () => '"{series}" ödüllerinde artık aynı renkte çerçeve ve simge var. Dizi değişmedi'),
  // 081-100
  'Sonraki atış sade atışa döner', 'Sonraki atış her zamanki hâline döner',
  'Sonraki atışta mantar biraz daha kalın olur', 'Sonraki atışta mantar biraz daha ince olur',
  'Sonraki atış birbirine yakın iki yöne bölünür', 'Sonraki atış üç yöne bölünür',
  'Sonraki atış daha çok aşındırır ama daha az iter', 'Sonraki atış daha çok iter ama daha az aşındırır',
  'Sonraki atış hızlıdır ama daha az iter',
  'Bir ödül başka bir ödülün çeşidine çevrildi',
  'Bir ödül konduğu çeşide geri döndürüldü',
  'Bir ödül en son kazandığın çeşide çevrildi',
  'Sonraki atış için ödüllerin dayanıklılığı gösterilir',
  'Sonraki atış için bir çeşit eksik setlere ipucu çıkar',
  'Sonraki atış için bu oyunda henüz kazanılmayan ödüller işaretlenir',
  'Sonraki atış için aynı çeşit ödüller adını ve sayısını gösterir',
  'Sonraki atış için hareketli ödüllerin hareket döngüsü gösterilir',
  'Sonraki atış için ilk isabete bir kılavuz çıkar. Sadece kılavuzdur, farklı olabilir',
  'Sonraki atışın yolu ardından daha net gösterilir',
  'Sonraki atış için nişanda bir açı ölçeği çıkar',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Şekerci Dükkânı', SER02: 'Çay Partisi', SER03: 'Yaz Şenliği', SER04: 'Eski Usul Oyunlar', SER05: 'Tanıdık Hayvanlar',
  SER06: 'Hayvanat Bahçesi', SER07: 'Orman Manzarası', SER08: 'Deniz Canlıları', SER09: 'Yolculuk Araçları', SER10: 'İş Araçları',
  SER11: 'Gezi Eşyaları', SER12: 'Uzay Keşfi', SER13: 'Gökyüzü Manzarası', SER14: 'Çiçek Bahçesi', SER15: 'Minik Böcekler',
  SER16: 'Konser', SER17: 'Herkes İçin Oyunlar', SER18: 'Kahvaltı ve Beslenme', SER19: 'Atıştırma Tezgâhı', SER20: 'Oyuncak Mutfak',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Tatlı]', SER02: '[Çay]', SER03: '[Şenlik]', SER04: '[Eski]', SER05: '[Evcil]',
  SER06: '[Hayvanat]', SER07: '[Orman]', SER08: '[Deniz]', SER09: '[Yolculuk]', SER10: '[Kamyon]',
  SER11: '[Gezi]', SER12: '[Uzay]', SER13: '[Gök]', SER14: '[Çiçek]', SER15: '[Böcek]',
  SER16: '[Müzik]', SER17: '[Oyun]', SER18: '[Yemek]', SER19: '[Atıştırma]', SER20: '[Mutfak]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const TR_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Daha çok mantar ya da farklı bir atış',
    RISK: 'Atış güçlenir ya da zayıflar, hangisi gelirse',
    STOCK: 'Ödül dizisini değiştir',
    GUIDE: 'Bir dizinin ödüllerini işaretle',
    MIX: 'Karışık hileler ve kılavuzlar',
    CHAOS: 'Ne olursa, kadere bırak',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Şu anda kullanılabilecek bir etki yok',
    effectNotApplicable: 'Bu etki bu sefer kullanılamadı',
    noOutlineTarget: 'Şu anda hedef ödül yok',
    sideEffectTemporaryOutsideSeries: 'Bir ödül geçici olarak dizinin dışında kalabilir',
  },
};
