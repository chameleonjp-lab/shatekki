/**
 * Turkish texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
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
  '1 mantar al', '2 mantar al', '3 mantar al', 'Biraz yontan atış', 'Çok yontan atış',
  'Biraz iten atış', 'Çok iten atış', 'Yeterli güçte vuruş', 'Sağlam güçte vuruş', 'Biraz hızlı atış',
  'Hızlı atış', 'Daha dengeli nişan', 'Çok daha dengeli nişan', 'Biraz daha az düşüş', 'Alçak kavisli atış',
  'Zıplayan atışa geç', 'Ağır atışa geç', 'Daha dar dağılma', 'İki yöne atış', 'Bir sekme yedekte',
  // 021-040
  '1 mantar kaybet', '2 mantar kaybet', '3 mantar kaybet', 'Zor yontan atış', 'Yumuşak atış',
  'Zor iten atış', 'Hafif iten atış', 'Mütevazı tek atış', 'Biraz yavaş atış', 'Yavaş atış',
  'Biraz kavisli atış', 'Kavisli atış', 'Daha az zıplayan atış', 'Hızla gücünü yitiren atış', 'Biraz titrek nişan',
  'Titrek nişan', 'Hızlı dolan çubuk', 'Yavaş dolan çubuk', 'Daha geniş dağılma', 'İki sekme eksik',
  // 041-060
  'Şekerci Dükkânı stoğu', 'Çay Partisi stoğu', 'Yaz Şenliği stoğu', 'Eski Oyunlar stoğu', 'Tanıdık Hayvanlar stoğu',
  'Hayvanat Bahçesi stoğu', 'Orman Manzarası stoğu', 'Deniz Canlıları stoğu', 'Seyahat Araçları stoğu', 'İş Araçları stoğu',
  'Gezi Malzemeleri stoğu', 'Uzay Keşfi stoğu', 'Gökyüzü Manzarası stoğu', 'Çiçek Bahçesi stoğu', 'Minik Böcekler stoğu',
  'Konser stoğu', 'Herkesin Oyunları stoğu', 'Kahvaltı ve Beslenme Çantası stoğu', 'Atıştırma Büfesi stoğu', 'Oyuncak Mutfak stoğu',
  // 061-080
  'Şekerci Dükkânını gör', 'Çay Partisini gör', 'Yaz Şenliğini gör', 'Eski Oyunları gör', 'Tanıdık Hayvanları gör',
  'Hayvanat Bahçesini gör', 'Orman Manzarasını gör', 'Deniz Canlılarını gör', 'Seyahat Araçlarını gör', 'İş Araçlarını gör',
  'Gezi Malzemelerini gör', 'Uzay Keşfini gör', 'Gökyüzü Manzarasını gör', 'Çiçek Bahçesini gör', 'Minik Böcekleri gör',
  'Konseri gör', 'Herkesin Oyunlarını gör', 'Kahvaltı ve Beslenme Çantasını gör', 'Atıştırma Büfesini gör', 'Oyuncak Mutfağı gör',
  // 081-100
  'Sade atışa dön', 'Sonraki atış her zamanki gibi', 'Kalın mantar', 'İnce mantar', 'Yakın iki yöne atış',
  'Üç yöne atış', 'Yontmaya odaklı atış', 'İtmeye odaklı atış', 'Hızlı ama hafif atış', 'Bir ödülü eşleştir',
  'Bir ödül özgün çeşidine dönsün', 'Kazandığın çeşitten bir tane daha', 'Dayanıklılık haritası', 'Bir çeşit eksik ipucu', 'Bu oyunda henüz kazanılmadı',
  'Aynı çeşitleri birlikte gör', 'Hareket döngüsünü gör', 'İlk vuruş tahmini', 'Uçuş yolunu göster', 'Nişan açı ölçeği',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '{n} mantar eklendi', '{n} mantar eklendi', '{n} mantar eklendi',
  'Sonraki atış biraz daha fazla yontar', 'Sonraki atış daha fazla yontar',
  'Sonraki atış biraz daha fazla iter', 'Sonraki atış daha güçlü iter',
  'Sonraki atış biraz daha güçlü yontar ve iter', 'Sonraki atış çok daha güçlü yontar ve iter',
  'Sonraki atış biraz daha hızlı uçar', 'Sonraki atış daha hızlı uçar',
  'Sonraki atışta nişan daha az sallanır', 'Sonraki atışta nişan çok daha az sallanır',
  'Sonraki atış biraz daha az düşer', 'Sonraki atış alçak bir kavisle uçar',
  'Sonraki atış zıplayan bir atıştır', 'Sonraki atış ağır bir atıştır',
  'Sonra bölünürse dağılma daha dar olur', 'Sonraki atış iki yöne bölünür',
  'Sonraki atış bir kez daha sekebilir',
  // 021-040
  '{n} mantar kaybedildi', '{n} mantar kaybedildi', '{n} mantar kaybedildi',
  'Sonraki atış daha az yontar', 'Sonraki atış çok daha az yontar',
  'Sonraki atış daha az iter', 'Sonraki atış çok daha az iter',
  'Sonraki atış biraz daha az yontar ve iter',
  'Sonraki atış biraz daha yavaş uçar', 'Sonraki atış yavaş uçar',
  'Sonraki atış biraz daha fazla kavis yapar', 'Sonraki atış yüksek bir kavisle uçar',
  'Sonraki atış biraz daha az zıplar', 'Sonraki atış hızla gücünü yitirir',
  'Sonraki atışta nişan biraz daha fazla sallanır', 'Sonraki atışta nişan daha fazla sallanır',
  'Sonraki dolum çubuğu biraz daha hızlı ilerler', 'Sonraki dolum çubuğu yavaş ilerler',
  'Sonra bölünürse dağılma daha geniş olur', 'Sonraki atış iki kez daha az sekebilir',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Kalan ödüller "{series}" dizilimine çevrildi. Daha önce kazanılan ödüller olduğu gibi kalır'),
  // 061-080
  ...Array.from({ length: 20 }, () => '"{series}" ödüllerine artık eşleşen renkli bir çerçeve ve sembol eklendi. Dizilim değişmedi'),
  // 081-100
  'Sonraki atış yine sade atış olur', 'Sonraki atış yine her zamanki gibi olur',
  'Sonraki atışın mantarı biraz daha kalın olur', 'Sonraki atışın mantarı biraz daha ince olur',
  'Sonraki atış birbirine yakın iki yöne bölünür', 'Sonraki atış üç yöne bölünür',
  'Sonraki atış daha çok yontar ama daha az iter', 'Sonraki atış daha çok iter ama daha az yontar',
  'Sonraki atış hızlıdır ama daha az iter',
  'Bir ödül başka bir ödülün çeşidine çevrildi',
  'Bir ödül yerleştirildiği çeşide geri döndü',
  'Bir ödül en son kazandığın çeşide çevrildi',
  'Sonraki atış için ödüllerin dayanıklılığı gösterilir',
  'Sonraki atış için bir çeşidi eksik setlere ipucu çıkar',
  'Sonraki atış için bu oyunda henüz kazanılmamış ödüller işaretlenir',
  'Sonraki atış için aynı çeşit ödüllerin adı ve sayısı gösterilir',
  'Sonraki atış için hareketli ödüllerin hareket döngüsü gösterilir',
  'Sonraki atış için ilk vuruşa dair bir kılavuz çıkar. Yalnızca fikir verir, farklı olabilir',
  'Bundan sonra sonraki atışın yolu daha net görünür',
  'Sonraki atış için nişanda bir açı ölçeği çıkar',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Şekerci Dükkânı', SER02: 'Çay Partisi', SER03: 'Yaz Şenliği', SER04: 'Eski Oyunlar', SER05: 'Tanıdık Hayvanlar',
  SER06: 'Hayvanat Bahçesi', SER07: 'Orman Manzarası', SER08: 'Deniz Canlıları', SER09: 'Seyahat Araçları', SER10: 'İş Araçları',
  SER11: 'Gezi Malzemeleri', SER12: 'Uzay Keşfi', SER13: 'Gökyüzü Manzarası', SER14: 'Çiçek Bahçesi', SER15: 'Minik Böcekler',
  SER16: 'Konser', SER17: 'Herkesin Oyunları', SER18: 'Kahvaltı ve Beslenme Çantası', SER19: 'Atıştırma Büfesi', SER20: 'Oyuncak Mutfak',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Şeker]', SER02: '[Çay]', SER03: '[Şenlik]', SER04: '[Nostalji]', SER05: '[Evcil]',
  SER06: '[Hayvanat]', SER07: '[Orman]', SER08: '[Deniz]', SER09: '[Seyahat]', SER10: '[İş]',
  SER11: '[Gezi]', SER12: '[Uzay]', SER13: '[Gökyüzü]', SER14: '[Çiçek]', SER15: '[Böcek]',
  SER16: '[Müzik]', SER17: '[Oyun]', SER18: '[Öğün]', SER19: '[Büfe]', SER20: '[Mutfak]',
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
    GAIN: 'Daha fazla mantar ya da farklı bir atış',
    RISK: 'Atış güçlenebilir ya da zayıflayabilir',
    STOCK: 'Ödül serisini değiştir',
    GUIDE: 'Bir serinin ödüllerini fark et',
    MIX: 'Çeşitli hileler ve ipuçları',
    CHAOS: 'Her şey olabilir, kadere bırak',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Şu anda kullanılabilecek bir etki yok',
    effectNotApplicable: 'Bu etki bu sefer kullanılamadı',
    noOutlineTarget: 'Şu anda hedef ödül yok',
    sideEffectTemporaryOutsideSeries: 'Bir ödül geçici olarak seri dışında kalabilir',
  },
};
