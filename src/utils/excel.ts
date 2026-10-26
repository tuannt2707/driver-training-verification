// Share header aliases between browser validation and the import API.
const aliases: Record<string, string[]> = {
  'Họ và tên': ['Họ và Tên', 'Họ tên', 'FullName'],
  'Ngày sinh': ['Ngày Sinh', 'Năm sinh', 'dateOfBirth'],
  'Số CCCD': ['CCCD', 'Số CMND', 'cccdNumber'],
  'Số GPLX': ['GPLX', 'licenseNumber'],
  'Số điện thoại': ['SĐT', 'phoneNumber'],
  'Điểm Kiểm Tra': ['Điểm kiểm tra', 'Điểm Sát Hạch', 'Điểm sát hạch', 'Điểm thi', 'examScore'],
};
const normalize = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
export function normalizeExcelRow(row: Record<string, unknown>): Record<string, any> {
  const entries = Object.entries(row);
  const result: Record<string, any> = Object.create(null);
  for (const [k, v] of entries) result[k.trim()] = v;
  for (const [canonical, names] of Object.entries(aliases)) {
    const keys = [canonical, ...names].map(normalize);
    const entry = entries.find(([key]) => keys.includes(normalize(key)));
    if (entry) result[canonical] = entry[1];
  }
  return result;
}
