/**
 * Indonesian texts of the expanded gameplay (complete). Machine-written by Claude from
 * the English text, not native-reviewed. Series symbols are short bracketed words and
 * are the same for the same series everywhere.
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
  'Dapat 1 gabus', 'Dapat 2 gabus', 'Dapat 3 gabus', 'Tembakan agak mengikis', 'Tembakan sangat mengikis',
  'Tembakan agak mendorong', 'Tembakan sangat mendorong', 'Pukulan cukup kuat', 'Pukulan mantap', 'Tembakan agak cepat',
  'Tembakan cepat', 'Bidikan lebih stabil', 'Bidikan jauh lebih stabil', 'Sedikit tidak mudah turun', 'Tembakan lengkung rendah',
  'Ganti ke gabus memantul', 'Ganti ke gabus berat', 'Pecahan lebih rapat', 'Tembakan dua arah', 'Sisa satu pantulan lagi',
  // 021-040
  'Kehilangan 1 gabus', 'Kehilangan 2 gabus', 'Kehilangan 3 gabus', 'Tembakan sulit mengikis', 'Tembakan lembek',
  'Tembakan sulit mendorong', 'Tembakan mendorong pelan', 'Tembakan tunggal sederhana', 'Tembakan agak lambat', 'Tembakan lambat',
  'Tembakan agak melengkung', 'Tembakan melengkung', 'Tembakan kurang memantul', 'Cepat kehilangan tenaga', 'Bidikan agak goyah',
  'Bidikan goyah', 'Bar pengisian cepat', 'Bar pengisian lambat', 'Pecahan lebih menyebar', 'Dua pantulan lebih sedikit',
  // 041-060
  'Jajaran Toko Manisan', 'Jajaran Pesta Teh', 'Jajaran Festival Musim Panas', 'Jajaran Mainan Tempo Dulu', 'Jajaran Hewan Akrab',
  'Jajaran Kebun Binatang', 'Jajaran Pemandangan Hutan', 'Jajaran Makhluk Laut', 'Jajaran Kendaraan Wisata', 'Jajaran Kendaraan Kerja',
  'Jajaran Perlengkapan Jalan-Jalan', 'Jajaran Penjelajahan Antariksa', 'Jajaran Pemandangan Langit', 'Jajaran Taman Bunga', 'Jajaran Serangga Mungil',
  'Jajaran Konser', 'Jajaran Permainan Bersama', 'Jajaran Sarapan dan Bekal', 'Jajaran Kedai Camilan', 'Jajaran Dapur Mainan',
  // 061-080
  'Tandai Toko Manisan', 'Tandai Pesta Teh', 'Tandai Festival Musim Panas', 'Tandai Mainan Tempo Dulu', 'Tandai Hewan Akrab',
  'Tandai Kebun Binatang', 'Tandai Pemandangan Hutan', 'Tandai Makhluk Laut', 'Tandai Kendaraan Wisata', 'Tandai Kendaraan Kerja',
  'Tandai Perlengkapan Jalan-Jalan', 'Tandai Penjelajahan Antariksa', 'Tandai Pemandangan Langit', 'Tandai Taman Bunga', 'Tandai Serangga Mungil',
  'Tandai Konser', 'Tandai Permainan Bersama', 'Tandai Sarapan dan Bekal', 'Tandai Kedai Camilan', 'Tandai Dapur Mainan',
  // 081-100
  'Kembali ke tembakan biasa', 'Tembakan berikutnya seperti biasa', 'Gabus tebal', 'Gabus tipis', 'Tembakan dua arah rapat',
  'Tembakan tiga arah', 'Tembakan fokus mengikis', 'Tembakan fokus mendorong', 'Tembakan cepat tapi ringan', 'Samakan satu hadiah',
  'Kembalikan satu hadiah ke jenis asal', 'Satu lagi dari jenis yang didapat', 'Peta ketahanan', 'Petunjuk satu jenis lagi', 'Belum didapat di permainan ini',
  'Lihat jenis yang sama sekaligus', 'Lihat siklus gerakan', 'Perkiraan kena pertama', 'Tampilkan lintasan terbang', 'Skala sudut bidikan',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  'Gabus bertambah {n}', 'Gabus bertambah {n}', 'Gabus bertambah {n}',
  'Tembakan berikutnya sedikit lebih mengikis', 'Tembakan berikutnya lebih mengikis',
  'Tembakan berikutnya sedikit lebih mendorong', 'Tembakan berikutnya mendorong lebih kuat',
  'Tembakan berikutnya sedikit lebih kuat mengikis dan mendorong', 'Tembakan berikutnya jauh lebih kuat mengikis dan mendorong',
  'Tembakan berikutnya terbang sedikit lebih cepat', 'Tembakan berikutnya terbang lebih cepat',
  'Bidikan tembakan berikutnya kurang goyah', 'Bidikan tembakan berikutnya jauh kurang goyah',
  'Tembakan berikutnya sedikit kurang turun', 'Tembakan berikutnya terbang melengkung rendah',
  'Tembakan berikutnya memakai gabus memantul', 'Tembakan berikutnya memakai gabus berat',
  'Jika pecah berikutnya, sebarannya lebih rapat', 'Tembakan berikutnya pecah ke dua arah',
  'Tembakan berikutnya bisa memantul satu kali lagi',
  // 021-040
  'Gabus berkurang {n}', 'Gabus berkurang {n}', 'Gabus berkurang {n}',
  'Tembakan berikutnya kurang mengikis', 'Tembakan berikutnya jauh kurang mengikis',
  'Tembakan berikutnya kurang mendorong', 'Tembakan berikutnya jauh kurang mendorong',
  'Tembakan berikutnya sedikit kurang mengikis dan mendorong',
  'Tembakan berikutnya terbang sedikit lebih lambat', 'Tembakan berikutnya terbang lambat',
  'Tembakan berikutnya sedikit lebih melengkung', 'Tembakan berikutnya melengkung tinggi',
  'Tembakan berikutnya sedikit kurang memantul', 'Tembakan berikutnya cepat kehilangan tenaga',
  'Bidikan tembakan berikutnya sedikit lebih goyah', 'Bidikan tembakan berikutnya lebih goyah',
  'Bar pengisian berikutnya bergerak sedikit lebih cepat', 'Bar pengisian berikutnya bergerak lambat',
  'Jika pecah berikutnya, sebarannya lebih lebar', 'Tembakan berikutnya bisa memantul dua kali lebih sedikit',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Hadiah yang tersisa diganti ke jajaran "{series}". Hadiah yang sudah didapat tetap'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Hadiah "{series}" kini punya garis warna dan simbol yang sama. Jajarannya tidak berubah'),
  // 081-100
  'Tembakan berikutnya kembali ke tembakan biasa', 'Tembakan berikutnya kembali seperti biasa',
  'Tembakan berikutnya memakai gabus sedikit lebih tebal', 'Tembakan berikutnya memakai gabus sedikit lebih tipis',
  'Tembakan berikutnya pecah ke dua arah yang rapat', 'Tembakan berikutnya pecah ke tiga arah',
  'Tembakan berikutnya lebih mengikis tetapi kurang mendorong', 'Tembakan berikutnya lebih mendorong tetapi kurang mengikis',
  'Tembakan berikutnya cepat tetapi kurang mendorong',
  'Satu hadiah diubah agar sama jenisnya dengan hadiah lain',
  'Satu hadiah dikembalikan ke jenis saat ditaruh',
  'Satu hadiah diubah menjadi jenis yang terakhir kamu dapat',
  'Untuk tembakan berikutnya, ketahanan hadiah ditampilkan',
  'Untuk tembakan berikutnya, muncul petunjuk untuk set yang kurang satu jenis',
  'Untuk tembakan berikutnya, hadiah yang belum didapat di permainan ini ditandai',
  'Untuk tembakan berikutnya, hadiah sejenis menampilkan nama dan jumlahnya',
  'Untuk tembakan berikutnya, siklus gerakan hadiah yang bergerak ditampilkan',
  'Untuk tembakan berikutnya, muncul panduan titik kena pertama. Ini hanya panduan dan bisa berbeda',
  'Lintasan tembakan berikutnya akan ditampilkan lebih jelas setelahnya',
  'Untuk tembakan berikutnya, skala sudut muncul di bidikan',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Toko Manisan', SER02: 'Pesta Teh', SER03: 'Festival Musim Panas', SER04: 'Mainan Tempo Dulu', SER05: 'Hewan Akrab',
  SER06: 'Kebun Binatang', SER07: 'Pemandangan Hutan', SER08: 'Makhluk Laut', SER09: 'Kendaraan Wisata', SER10: 'Kendaraan Kerja',
  SER11: 'Perlengkapan Jalan-Jalan', SER12: 'Penjelajahan Antariksa', SER13: 'Pemandangan Langit', SER14: 'Taman Bunga', SER15: 'Serangga Mungil',
  SER16: 'Konser', SER17: 'Permainan Bersama', SER18: 'Sarapan dan Bekal', SER19: 'Kedai Camilan', SER20: 'Dapur Mainan',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Manis]', SER02: '[Teh]', SER03: '[Festival]', SER04: '[Klasik]', SER05: '[Peliharaan]',
  SER06: '[Kebun]', SER07: '[Hutan]', SER08: '[Laut]', SER09: '[Wisata]', SER10: '[Truk]',
  SER11: '[Piknik]', SER12: '[Antariksa]', SER13: '[Langit]', SER14: '[Bunga]', SER15: '[Serangga]',
  SER16: '[Musik]', SER17: '[Main]', SER18: '[Makan]', SER19: '[Camilan]', SER20: '[Dapur]',
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
    GAIN: 'Gabus lebih banyak, atau tembakan berbeda',
    RISK: 'Tembakan menguat atau melemah, entah mana',
    STOCK: 'Ganti seri hadiah',
    GUIDE: 'Tandai hadiah dari satu seri',
    MIX: 'Aneka trik dan panduan',
    CHAOS: 'Apa saja, serahkan pada nasib',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Saat ini tidak ada efek yang bisa dipakai',
    effectNotApplicable: 'Efek ini tidak bisa dipakai kali ini',
    noOutlineTarget: 'Saat ini tidak ada hadiah sasaran',
    sideEffectTemporaryOutsideSeries: 'Satu hadiah mungkin sementara berada di luar seri',
  },
};
