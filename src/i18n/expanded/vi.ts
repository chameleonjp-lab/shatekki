/**
 * Vietnamese texts of the expanded gameplay (complete). Machine-written by Claude from the
 * English text, not native-reviewed. Series symbols are short bracketed words and are the
 * same for the same series everywhere.
 */
import { VI_PAIR_CLUES, VI_PAIR_NAMES } from './vi-pairs';
import { VI_QUESTIONS } from './vi-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
VI_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
VI_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Cần 2 loại.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
VI_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  'Nhận 1 nút bần', 'Nhận 2 nút bần', 'Nhận 3 nút bần', 'Phát bắn hơi mài mòn', 'Phát bắn mài mòn mạnh',
  'Phát bắn hơi đẩy', 'Phát bắn đẩy mạnh', 'Cú đánh khá mạnh', 'Cú đánh chắc mạnh', 'Phát bắn hơi nhanh',
  'Phát bắn nhanh', 'Ngắm vững hơn', 'Ngắm vững hơn nữa', 'Hơi ít rơi', 'Phát bắn vòng cung thấp',
  'Đổi sang nút bần nảy', 'Đổi sang nút bần nặng', 'Tách gọn hơn', 'Phát bắn hai hướng', 'Thêm một lần nảy dự phòng',
  // 021-040
  'Mất 1 nút bần', 'Mất 2 nút bần', 'Mất 3 nút bần', 'Phát bắn khó mài mòn', 'Phát bắn mềm',
  'Phát bắn khó đẩy', 'Phát bắn đẩy nhẹ', 'Phát bắn đơn giản', 'Phát bắn hơi chậm', 'Phát bắn chậm',
  'Phát bắn hơi vòng cung', 'Phát bắn vòng cung', 'Phát bắn ít nảy', 'Nhanh mất đà', 'Ngắm hơi rung',
  'Ngắm rung', 'Thanh nạp nhanh', 'Thanh nạp chậm', 'Tách rộng hơn', 'Bớt hai lần nảy',
  // 041-060
  'Hàng Tiệm Kẹo', 'Hàng Tiệc Trà', 'Hàng Lễ Hội Mùa Hè', 'Hàng Trò Chơi Xưa', 'Hàng Thú Quen Thuộc',
  'Hàng Sở Thú', 'Hàng Cảnh Rừng', 'Hàng Sinh Vật Biển', 'Hàng Xe Du Lịch', 'Hàng Xe Công Vụ',
  'Hàng Đồ Dã Ngoại', 'Hàng Khám Phá Vũ Trụ', 'Hàng Cảnh Bầu Trời', 'Hàng Vườn Hoa', 'Hàng Côn Trùng Nhỏ',
  'Hàng Buổi Hòa Nhạc', 'Hàng Trò Chơi Chung', 'Hàng Bữa Sáng và Cơm Hộp', 'Hàng Quầy Ăn Vặt', 'Hàng Bếp Đồ Chơi',
  // 061-080
  'Tìm Tiệm Kẹo', 'Tìm Tiệc Trà', 'Tìm Lễ Hội Mùa Hè', 'Tìm Trò Chơi Xưa', 'Tìm Thú Quen Thuộc',
  'Tìm Sở Thú', 'Tìm Cảnh Rừng', 'Tìm Sinh Vật Biển', 'Tìm Xe Du Lịch', 'Tìm Xe Công Vụ',
  'Tìm Đồ Dã Ngoại', 'Tìm Khám Phá Vũ Trụ', 'Tìm Cảnh Bầu Trời', 'Tìm Vườn Hoa', 'Tìm Côn Trùng Nhỏ',
  'Tìm Buổi Hòa Nhạc', 'Tìm Trò Chơi Chung', 'Tìm Bữa Sáng và Cơm Hộp', 'Tìm Quầy Ăn Vặt', 'Tìm Bếp Đồ Chơi',
  // 081-100
  'Trở lại phát bắn thường', 'Phát sau như thường lệ', 'Nút bần dày', 'Nút bần mỏng', 'Hai hướng gần nhau',
  'Phát bắn ba hướng', 'Phát bắn thiên mài mòn', 'Phát bắn thiên đẩy', 'Nhanh nhưng nhẹ', 'Đổi một món quà cho khớp',
  'Đưa một món quà về loại gốc', 'Thêm một món loại vừa nhận', 'Bản đồ độ bền', 'Gợi ý thêm một loại', 'Chưa nhận trong ván này',
  'Xem các món cùng loại', 'Xem chu kỳ chuyển động', 'Dự đoán điểm trúng đầu', 'Hiện đường bay', 'Thước góc ngắm',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  'Thêm {n} nút bần', 'Thêm {n} nút bần', 'Thêm {n} nút bần',
  'Phát sau mài mòn mạnh hơn một chút', 'Phát sau mài mòn mạnh hơn',
  'Phát sau đẩy mạnh hơn một chút', 'Phát sau đẩy mạnh hơn',
  'Phát sau mài và đẩy mạnh hơn một chút', 'Phát sau mài và đẩy mạnh hơn nhiều',
  'Phát sau bay nhanh hơn một chút', 'Phát sau bay nhanh hơn',
  'Phát sau ngắm ít rung hơn', 'Phát sau ngắm ít rung hơn nhiều',
  'Phát sau rơi ít hơn một chút', 'Phát sau bay theo vòng cung thấp',
  'Phát sau dùng nút bần nảy', 'Phát sau dùng nút bần nặng',
  'Nếu lần sau tách ra, độ tỏa sẽ hẹp hơn', 'Phát sau tách ra hai hướng',
  'Phát sau có thể nảy thêm một lần',
  // 021-040
  'Mất {n} nút bần', 'Mất {n} nút bần', 'Mất {n} nút bần',
  'Phát sau mài mòn yếu hơn', 'Phát sau mài mòn yếu hơn nhiều',
  'Phát sau đẩy yếu hơn', 'Phát sau đẩy yếu hơn nhiều',
  'Phát sau mài và đẩy yếu hơn một chút',
  'Phát sau bay chậm hơn một chút', 'Phát sau bay chậm',
  'Phát sau cong hơn một chút', 'Phát sau bay vòng cung cao',
  'Phát sau nảy ít hơn một chút', 'Phát sau nhanh mất đà',
  'Phát sau ngắm rung hơn một chút', 'Phát sau ngắm rung hơn',
  'Thanh nạp lần sau chạy nhanh hơn một chút', 'Thanh nạp lần sau chạy chậm',
  'Nếu lần sau tách ra, độ tỏa sẽ rộng hơn', 'Phát sau nảy ít hơn hai lần',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Các món quà còn lại đã đổi sang hàng "{series}". Quà đã nhận vẫn giữ nguyên'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Quà "{series}" giờ có viền màu và ký hiệu giống nhau. Hàng không thay đổi'),
  // 081-100
  'Phát sau trở lại phát bắn thường', 'Phát sau trở lại như thường lệ',
  'Phát sau dùng nút bần dày hơn một chút', 'Phát sau dùng nút bần mỏng hơn một chút',
  'Phát sau tách ra hai hướng gần nhau', 'Phát sau tách ra ba hướng',
  'Phát sau mài mạnh hơn nhưng đẩy yếu hơn', 'Phát sau đẩy mạnh hơn nhưng mài yếu hơn',
  'Phát sau nhanh nhưng đẩy yếu hơn',
  'Một món quà đã đổi cho cùng loại với món khác',
  'Một món quà đã trở về loại khi được bày',
  'Một món quà đã đổi sang loại bạn nhận gần nhất',
  'Ở phát sau, độ bền của quà được hiển thị',
  'Ở phát sau, có gợi ý cho bộ còn thiếu một loại',
  'Ở phát sau, quà chưa nhận trong ván này được đánh dấu',
  'Ở phát sau, quà cùng loại hiện tên và số lượng',
  'Ở phát sau, chu kỳ chuyển động của quà đang di chuyển được hiển thị',
  'Ở phát sau, có hướng dẫn điểm trúng đầu tiên. Chỉ là hướng dẫn và có thể khác',
  'Đường bay của phát sau sẽ được hiện rõ hơn sau đó',
  'Ở phát sau, thước đo góc xuất hiện trên tầm ngắm',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Tiệm Kẹo', SER02: 'Tiệc Trà', SER03: 'Lễ Hội Mùa Hè', SER04: 'Trò Chơi Xưa', SER05: 'Thú Quen Thuộc',
  SER06: 'Sở Thú', SER07: 'Cảnh Rừng', SER08: 'Sinh Vật Biển', SER09: 'Xe Du Lịch', SER10: 'Xe Công Vụ',
  SER11: 'Đồ Dã Ngoại', SER12: 'Khám Phá Vũ Trụ', SER13: 'Cảnh Bầu Trời', SER14: 'Vườn Hoa', SER15: 'Côn Trùng Nhỏ',
  SER16: 'Buổi Hòa Nhạc', SER17: 'Trò Chơi Chung', SER18: 'Bữa Sáng và Cơm Hộp', SER19: 'Quầy Ăn Vặt', SER20: 'Bếp Đồ Chơi',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Kẹo]', SER02: '[Trà]', SER03: '[Lễ-hội]', SER04: '[Xưa]', SER05: '[Thú-cưng]',
  SER06: '[Sở-thú]', SER07: '[Rừng]', SER08: '[Biển]', SER09: '[Du-lịch]', SER10: '[Xe-tải]',
  SER11: '[Dã-ngoại]', SER12: '[Vũ-trụ]', SER13: '[Trời]', SER14: '[Hoa]', SER15: '[Côn-trùng]',
  SER16: '[Nhạc]', SER17: '[Trò-chơi]', SER18: '[Bữa-ăn]', SER19: '[Ăn-vặt]', SER20: '[Bếp]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const VI_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Thêm nút bần, hoặc đổi kiểu bắn',
    RISK: 'Phát bắn mạnh lên hay yếu đi, tùy may rủi',
    STOCK: 'Đổi loạt quà',
    GUIDE: 'Đánh dấu quà của một loạt',
    MIX: 'Mẹo và hướng dẫn đủ loại',
    CHAOS: 'Gì cũng được, phó mặc số phận',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Hiện không có hiệu ứng nào dùng được',
    effectNotApplicable: 'Lần này không dùng được hiệu ứng này',
    noOutlineTarget: 'Hiện không có món quà mục tiêu',
    sideEffectTemporaryOutsideSeries: 'Một món quà có thể tạm thời nằm ngoài loạt',
  },
};
