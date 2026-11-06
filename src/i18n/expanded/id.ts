/**
 * Indonesian texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { ID_PAIR_CLUES, ID_PAIR_NAMES } from './id-pairs';
import { ID_QUESTIONS } from './id-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
ID_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
ID_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Butuh 2 jenis.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
ID_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  'Dapat 1 gabus', 'Dapat 2 gabus', 'Dapat 3 gabus', 'Tembakan sedikit mengikis', 'Tembakan sangat mengikis',
  'Tembakan sedikit mendorong', 'Tembakan sangat mendorong', 'Kena dengan tenaga lumayan', 'Kena dengan tenaga mantap', 'Tembakan agak cepat',
  'Tembakan cepat', 'Bidikan lebih stabil', 'Bidikan makin stabil', 'Sedikit lebih kecil turunnya', 'Tembakan melengkung rendah',
  'Ganti ke tembakan memantul', 'Ganti ke tembakan berat', 'Sebaran lebih rapat', 'Tembakan dua arah', 'Cadangan satu pantulan',
  // 021-040
  'Kehilangan 1 gabus', 'Kehilangan 2 gabus', 'Kehilangan 3 gabus', 'Tembakan sulit mengikis', 'Tembakan lembut',
  'Tembakan sulit mendorong', 'Tembakan mendorong pelan', 'Tembakan biasa yang sederhana', 'Tembakan agak lambat', 'Tembakan lambat',
  'Tembakan sedikit melengkung', 'Tembakan melengkung', 'Tembakan kurang memantul', 'Cepat kehilangan tenaga', 'Bidikan sedikit goyang',
  'Bidikan goyang', 'Bar isi cepat', 'Bar isi lambat', 'Sebaran lebih lebar', 'Kurang dua pantulan',
  // 041-060
  'Stok Toko Manisan', 'Stok Pesta Teh', 'Stok Festival Musim Panas', 'Stok Permainan Zaman Dulu', 'Stok Hewan Akrab',
  'Stok Kebun Binatang', 'Stok Pemandangan Hutan', 'Stok Makhluk Laut', 'Stok Kendaraan Wisata', 'Stok Kendaraan Kerja',
  'Stok Perlengkapan Piknik', 'Stok Penjelajahan Angkasa', 'Stok Pemandangan Langit', 'Stok Taman Bunga', 'Stok Serangga Mungil',
  'Stok Konser', 'Stok Permainan Semua Orang', 'Stok Sarapan dan Bekal', 'Stok Kedai Camilan', 'Stok Dapur Mainan',
  // 061-080
  'Lihat Toko Manisan', 'Lihat Pesta Teh', 'Lihat Festival Musim Panas', 'Lihat Permainan Zaman Dulu', 'Lihat Hewan Akrab',
  'Lihat Kebun Binatang', 'Lihat Pemandangan Hutan', 'Lihat Makhluk Laut', 'Lihat Kendaraan Wisata', 'Lihat Kendaraan Kerja',
  'Lihat Perlengkapan Piknik', 'Lihat Penjelajahan Angkasa', 'Lihat Pemandangan Langit', 'Lihat Taman Bunga', 'Lihat Serangga Mungil',
  'Lihat Konser', 'Lihat Permainan Semua Orang', 'Lihat Sarapan dan Bekal', 'Lihat Kedai Camilan', 'Lihat Dapur Mainan',
  // 081-100
  'Kembali ke tembakan biasa', 'Tembakan berikutnya seperti biasa', 'Gabus tebal', 'Gabus tipis', 'Tembakan dua arah rapat',
  'Tembakan tiga arah', 'Tembakan fokus mengikis', 'Tembakan fokus mendorong', 'Tembakan cepat tapi ringan', 'Samakan satu hadiah',
  'Satu hadiah kembali ke jenis asalnya', 'Tambah satu jenis yang sudah dimenangkan', 'Peta ketahanan', 'Petunjuk kurang satu jenis', 'Belum dimenangkan di permainan ini',
  'Lihat jenis yang sama bersama', 'Lihat siklus gerak', 'Perkiraan kena pertama', 'Tampilkan jalur terbang', 'Skala sudut bidikan',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  'Bertambah {n} gabus', 'Bertambah {n} gabus', 'Bertambah {n} gabus',
  'Tembakan berikutnya sedikit lebih mengikis', 'Tembakan berikutnya lebih mengikis',
  'Tembakan berikutnya sedikit lebih mendorong', 'Tembakan berikutnya lebih kuat mendorong',
  'Tembakan berikutnya sedikit lebih kuat mengikis dan mendorong', 'Tembakan berikutnya jauh lebih kuat mengikis dan mendorong',
  'Tembakan berikutnya terbang sedikit lebih cepat', 'Tembakan berikutnya terbang lebih cepat',
  'Bidikan berikutnya kurang goyang', 'Bidikan berikutnya jauh kurang goyang',
  'Tembakan berikutnya turun sedikit lebih sedikit', 'Tembakan berikutnya terbang melengkung rendah',
  'Tembakan berikutnya adalah tembakan memantul', 'Tembakan berikutnya adalah tembakan berat',
  'Kalau terbelah berikutnya, sebarannya lebih rapat', 'Tembakan berikutnya terbelah ke dua arah',
  'Tembakan berikutnya bisa memantul satu kali lagi',
  // 021-040
  'Berkurang {n} gabus', 'Berkurang {n} gabus', 'Berkurang {n} gabus',
  'Tembakan berikutnya kurang mengikis', 'Tembakan berikutnya jauh kurang mengikis',
  'Tembakan berikutnya kurang mendorong', 'Tembakan berikutnya jauh kurang mendorong',
  'Tembakan berikutnya sedikit kurang mengikis dan mendorong',
  'Tembakan berikutnya terbang sedikit lebih lambat', 'Tembakan berikutnya terbang lambat',
  'Tembakan berikutnya melengkung sedikit lebih banyak', 'Tembakan berikutnya melengkung tinggi',
  'Tembakan berikutnya memantul sedikit lebih sedikit', 'Tembakan berikutnya cepat kehilangan tenaga',
  'Bidikan berikutnya sedikit lebih goyang', 'Bidikan berikutnya lebih goyang',
  'Bar isi berikutnya bergerak sedikit lebih cepat', 'Bar isi berikutnya bergerak lambat',
  'Kalau terbelah berikutnya, sebarannya lebih lebar', 'Tembakan berikutnya bisa memantul dua kali lebih sedikit',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Hadiah yang tersisa diganti ke jajaran "{series}". Hadiah yang sudah dimenangkan tetap seperti semula'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Hadiah "{series}" kini punya garis tepi berwarna dan simbol yang sesuai. Jajaran tidak berubah'),
  // 081-100
  'Tembakan berikutnya kembali jadi tembakan biasa', 'Tembakan berikutnya kembali seperti biasa',
  'Tembakan berikutnya bergabus sedikit lebih tebal', 'Tembakan berikutnya bergabus sedikit lebih tipis',
  'Tembakan berikutnya terbelah ke dua arah yang rapat', 'Tembakan berikutnya terbelah ke tiga arah',
  'Tembakan berikutnya lebih mengikis tapi kurang mendorong', 'Tembakan berikutnya lebih mendorong tapi kurang mengikis',
  'Tembakan berikutnya cepat tapi kurang mendorong',
  'Satu hadiah diubah mengikuti jenis hadiah lain',
  'Satu hadiah dikembalikan ke jenis saat ia diletakkan',
  'Satu hadiah diubah ke jenis yang terakhir dimenangkan',
  'Untuk tembakan berikutnya, ketahanan hadiah ditampilkan',
  'Untuk tembakan berikutnya, muncul petunjuk untuk set yang kurang satu jenis',
  'Untuk tembakan berikutnya, hadiah yang belum dimenangkan di permainan ini diberi tanda',
  'Untuk tembakan berikutnya, hadiah sejenis menampilkan nama dan jumlahnya',
  'Untuk tembakan berikutnya, siklus gerak hadiah yang bergerak ditampilkan',
  'Untuk tembakan berikutnya, muncul panduan kena pertama. Hanya acuan dan bisa meleset',
  'Setelah ini, jalur tembakan berikutnya lebih mudah dilihat',
  'Untuk tembakan berikutnya, muncul skala sudut pada bidikan',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Toko Manisan', SER02: 'Pesta Teh', SER03: 'Festival Musim Panas', SER04: 'Permainan Zaman Dulu', SER05: 'Hewan Akrab',
  SER06: 'Kebun Binatang', SER07: 'Pemandangan Hutan', SER08: 'Makhluk Laut', SER09: 'Kendaraan Wisata', SER10: 'Kendaraan Kerja',
  SER11: 'Perlengkapan Piknik', SER12: 'Penjelajahan Angkasa', SER13: 'Pemandangan Langit', SER14: 'Taman Bunga', SER15: 'Serangga Mungil',
  SER16: 'Konser', SER17: 'Permainan Semua Orang', SER18: 'Sarapan dan Bekal', SER19: 'Kedai Camilan', SER20: 'Dapur Mainan',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Manisan]', SER02: '[Teh]', SER03: '[Festival]', SER04: '[Jadul]', SER05: '[Hewan]',
  SER06: '[Kebun]', SER07: '[Hutan]', SER08: '[Laut]', SER09: '[Wisata]', SER10: '[Kerja]',
  SER11: '[Piknik]', SER12: '[Angkasa]', SER13: '[Langit]', SER14: '[Bunga]', SER15: '[Serangga]',
  SER16: '[Musik]', SER17: '[Game]', SER18: '[Bekal]', SER19: '[Jajan]', SER20: '[Dapur]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const ID_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Tambah gabus, atau ganti tembakan',
    RISK: 'Tembakan menguat atau melemah, bisa dua-duanya',
    STOCK: 'Ganti seri hadiah',
    GUIDE: 'Lihat hadiah dari satu seri',
    MIX: 'Aneka trik dan petunjuk',
    CHAOS: 'Apa saja bisa terjadi, serahkan pada nasib',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Saat ini tidak ada efek yang bisa dipakai',
    effectNotApplicable: 'Efek ini tidak bisa dipakai kali ini',
    noOutlineTarget: 'Saat ini tidak ada hadiah sasaran',
    sideEffectTemporaryOutsideSeries: 'Sebuah hadiah bisa sementara berada di luar seri',
  },
};
