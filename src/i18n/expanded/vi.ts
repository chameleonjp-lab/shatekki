/**
 * Vietnamese texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
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
  'Nhận 1 nút bần', 'Nhận 2 nút bần', 'Nhận 3 nút bần', 'Phát bắn hơi dễ gọt', 'Phát bắn rất dễ gọt',
  'Phát bắn hơi đẩy mạnh', 'Phát bắn đẩy rất mạnh', 'Cú trúng khá mạnh', 'Cú trúng mạnh chắc', 'Phát bắn hơi nhanh',
  'Phát bắn nhanh', 'Ngắm vững hơn', 'Ngắm vững hơn nhiều', 'Rơi xuống ít hơn một chút', 'Phát bắn vòng thấp',
  'Đổi sang phát bắn nảy', 'Đổi sang phát bắn nặng', 'Chùm tỏa hẹp hơn', 'Phát bắn hai hướng', 'Dự phòng thêm một lần nảy',
  // 021-040
  'Mất 1 nút bần', 'Mất 2 nút bần', 'Mất 3 nút bần', 'Phát bắn khó gọt', 'Phát bắn mềm',
  'Phát bắn khó đẩy', 'Phát bắn đẩy nhẹ', 'Phát bắn đơn giản khiêm tốn', 'Phát bắn hơi chậm', 'Phát bắn chậm',
  'Phát bắn hơi cong', 'Phát bắn cong', 'Phát bắn ít nảy hơn', 'Nhanh mất đà', 'Ngắm hơi rung',
  'Ngắm rung', 'Thanh nạp đầy nhanh', 'Thanh nạp đầy chậm', 'Chùm tỏa rộng hơn', 'Ít hơn hai lần nảy',
  // 041-060
  'Đổi kho Tiệm Kẹo', 'Đổi kho Tiệc Trà', 'Đổi kho Lễ Hội Mùa Hè', 'Đổi kho Trò Chơi Ngày Xưa', 'Đổi kho Thú Quen Thuộc',
  'Đổi kho Sở Thú', 'Đổi kho Cảnh Rừng', 'Đổi kho Sinh Vật Biển', 'Đổi kho Xe Du Lịch', 'Đổi kho Xe Công Việc',
  'Đổi kho Đồ Dã Ngoại', 'Đổi kho Khám Phá Vũ Trụ', 'Đổi kho Cảnh Bầu Trời', 'Đổi kho Vườn Hoa', 'Đổi kho Côn Trùng Nhỏ',
  'Đổi kho Buổi Hòa Nhạc', 'Đổi kho Trò Chơi Cho Mọi Người', 'Đổi kho Bữa Sáng Và Cơm Hộp', 'Đổi kho Quầy Ăn Vặt', 'Đổi kho Bếp Đồ Chơi',
  // 061-080
  'Nhận ra Tiệm Kẹo', 'Nhận ra Tiệc Trà', 'Nhận ra Lễ Hội Mùa Hè', 'Nhận ra Trò Chơi Ngày Xưa', 'Nhận ra Thú Quen Thuộc',
  'Nhận ra Sở Thú', 'Nhận ra Cảnh Rừng', 'Nhận ra Sinh Vật Biển', 'Nhận ra Xe Du Lịch', 'Nhận ra Xe Công Việc',
  'Nhận ra Đồ Dã Ngoại', 'Nhận ra Khám Phá Vũ Trụ', 'Nhận ra Cảnh Bầu Trời', 'Nhận ra Vườn Hoa', 'Nhận ra Côn Trùng Nhỏ',
  'Nhận ra Buổi Hòa Nhạc', 'Nhận ra Trò Chơi Cho Mọi Người', 'Nhận ra Bữa Sáng Và Cơm Hộp', 'Nhận ra Quầy Ăn Vặt', 'Nhận ra Bếp Đồ Chơi',
  // 081-100
  'Về lại phát bắn thường', 'Phát bắn sau như bình thường', 'Nút bần dày', 'Nút bần mỏng', 'Phát bắn hai hướng sát nhau',
  'Phát bắn ba hướng', 'Phát bắn thiên về gọt', 'Phát bắn thiên về đẩy', 'Phát bắn nhanh nhưng nhẹ', 'Cho một giải khớp loại',
  'Một giải về lại loại ban đầu', 'Thêm một giải loại vừa thắng', 'Bản đồ độ bền', 'Gợi ý thiếu một loại', 'Ván này chưa thắng',
  'Xem các loại giống nhau cùng nhau', 'Xem chu kỳ chuyển động', 'Đoán cú trúng đầu', 'Hiện đường bay', 'Thước đo góc ngắm',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  'Được thêm {n} nút bần', 'Được thêm {n} nút bần', 'Được thêm {n} nút bần',
  'Phát bắn sau gọt nhiều hơn một chút', 'Phát bắn sau gọt nhiều hơn',
  'Phát bắn sau đẩy mạnh hơn một chút', 'Phát bắn sau đẩy mạnh hơn',
  'Phát bắn sau gọt và đẩy mạnh hơn một chút', 'Phát bắn sau gọt và đẩy mạnh hơn nhiều',
  'Phát bắn sau bay nhanh hơn một chút', 'Phát bắn sau bay nhanh hơn',
  'Phát bắn sau ngắm ít rung hơn', 'Phát bắn sau ngắm ít rung hơn nhiều',
  'Phát bắn sau rơi xuống ít hơn một chút', 'Phát bắn sau bay theo đường vòng thấp',
  'Phát bắn sau là phát bắn nảy', 'Phát bắn sau là phát bắn nặng',
  'Nếu lần sau tách ra, chùm tỏa sẽ hẹp hơn', 'Phát bắn sau tách thành hai hướng',
  'Phát bắn sau có thể nảy thêm một lần',
  // 021-040
  'Mất {n} nút bần', 'Mất {n} nút bần', 'Mất {n} nút bần',
  'Phát bắn sau gọt ít hơn', 'Phát bắn sau gọt ít hơn nhiều',
  'Phát bắn sau đẩy yếu hơn', 'Phát bắn sau đẩy yếu hơn nhiều',
  'Phát bắn sau gọt và đẩy yếu hơn một chút',
  'Phát bắn sau bay chậm hơn một chút', 'Phát bắn sau bay chậm',
  'Phát bắn sau cong hơn một chút', 'Phát bắn sau bay vòng cao',
  'Phát bắn sau nảy ít hơn một chút', 'Phát bắn sau nhanh mất đà',
  'Phát bắn sau ngắm rung hơn một chút', 'Phát bắn sau ngắm rung hơn',
  'Thanh nạp sau chạy nhanh hơn một chút', 'Thanh nạp sau chạy chậm',
  'Nếu lần sau tách ra, chùm tỏa sẽ rộng hơn', 'Phát bắn sau nảy ít hơn hai lần',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Các giải còn lại đã đổi sang bộ "{series}". Giải đã thắng vẫn giữ nguyên'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Giải "{series}" nay có viền màu và ký hiệu tương ứng. Bộ giải không đổi'),
  // 081-100
  'Phát bắn sau trở lại phát bắn thường', 'Phát bắn sau trở lại như bình thường',
  'Nút bần của phát bắn sau dày hơn một chút', 'Nút bần của phát bắn sau mỏng hơn một chút',
  'Phát bắn sau tách thành hai hướng sát nhau', 'Phát bắn sau tách thành ba hướng',
  'Phát bắn sau gọt nhiều hơn nhưng đẩy yếu hơn', 'Phát bắn sau đẩy mạnh hơn nhưng gọt yếu hơn',
  'Phát bắn sau nhanh nhưng đẩy yếu hơn',
  'Một giải đã đổi theo loại của giải khác',
  'Một giải đã trở về loại khi được đặt ra',
  'Một giải đã đổi sang loại vừa thắng gần nhất',
  'Với phát bắn sau, độ bền của các giải được hiển thị',
  'Với phát bắn sau, hiện gợi ý cho các bộ còn thiếu một loại',
  'Với phát bắn sau, các giải chưa thắng trong ván này được đánh dấu',
  'Với phát bắn sau, các giải cùng loại hiện tên và số lượng',
  'Với phát bắn sau, chu kỳ chuyển động của các giải di chuyển được hiển thị',
  'Với phát bắn sau, hiện chỉ dẫn cho cú trúng đầu tiên. Chỉ là tham khảo, có thể lệch',
  'Sau đó, đường bay của phát bắn sau dễ thấy hơn',
  'Với phát bắn sau, hiện thước đo góc trên tâm ngắm',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Tiệm Kẹo', SER02: 'Tiệc Trà', SER03: 'Lễ Hội Mùa Hè', SER04: 'Trò Chơi Ngày Xưa', SER05: 'Thú Quen Thuộc',
  SER06: 'Sở Thú', SER07: 'Cảnh Rừng', SER08: 'Sinh Vật Biển', SER09: 'Xe Du Lịch', SER10: 'Xe Công Việc',
  SER11: 'Đồ Dã Ngoại', SER12: 'Khám Phá Vũ Trụ', SER13: 'Cảnh Bầu Trời', SER14: 'Vườn Hoa', SER15: 'Côn Trùng Nhỏ',
  SER16: 'Buổi Hòa Nhạc', SER17: 'Trò Chơi Cho Mọi Người', SER18: 'Bữa Sáng Và Cơm Hộp', SER19: 'Quầy Ăn Vặt', SER20: 'Bếp Đồ Chơi',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Kẹo]', SER02: '[Trà]', SER03: '[Hội]', SER04: '[Xưa]', SER05: '[Thú]',
  SER06: '[Chuồng]', SER07: '[Rừng]', SER08: '[Biển]', SER09: '[Chuyến]', SER10: '[Xây]',
  SER11: '[Picnic]', SER12: '[Sao]', SER13: '[Trời]', SER14: '[Hoa]', SER15: '[Bọ]',
  SER16: '[Nhạc]', SER17: '[Game]', SER18: '[Bữa]', SER19: '[Snack]', SER20: '[Bếp]',
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
    GAIN: 'Thêm nút bần, hoặc đổi phát bắn',
    RISK: 'Phát bắn mạnh lên hay yếu đi, đều có thể',
    STOCK: 'Đổi series giải thưởng',
    GUIDE: 'Nhận ra giải của một series',
    MIX: 'Đủ loại mẹo và gợi ý',
    CHAOS: 'Điều gì cũng có thể, phó mặc cho số phận',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Hiện không có hiệu ứng nào dùng được',
    effectNotApplicable: 'Hiệu ứng này không dùng được lần này',
    noOutlineTarget: 'Hiện không có giải thưởng mục tiêu',
    sideEffectTemporaryOutsideSeries: 'Một giải có thể tạm nằm ngoài series',
  },
};
