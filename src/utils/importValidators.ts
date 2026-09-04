import type { WorkBook, WorkSheet } from 'xlsx';
import type { Account, CatalogClass, Subject } from '../types';
import { SUPPORTED_GRADES, sortGrades } from '../constants';

export type ImportEntity = 'account' | 'class' | 'subject';
export type ImportMode = 'create' | 'update';

export interface ImportIssue {
  rowNumber: number;
  field: string;
  message: string;
}

export type ImportSourceType = 'edusmart' | 'vnedu_account' | 'vnedu_student_roster';

export interface ImportPreviewRowBase {
  __rowNumber: number;
  __mode: ImportMode;
}

export type AccountImportRow = ImportPreviewRowBase & {
  user_id?: string;
  ho_ten: string;
  ten_dang_nhap: string;
  mat_khau?: string;
  vai_tro: 'admin' | 'teacher' | 'student';
  lop_id?: string;
  ten_lop?: string;
  khoi?: string;
  trang_thai: 'active' | 'inactive';
  ghi_chu?: string;
  ma_hoc_sinh?: string;
  ngay_sinh?: string;
  tai_khoan_dinh_danh?: string;
  mat_khau_khoi_tao?: string;
  so_luot_dang_nhap?: number | string;
  lan_dang_nhap_cuoi?: string;
  so_dien_thoai?: string;
  gioi_tinh?: 'Nam' | 'Nữ' | string;
  nguon_du_lieu?: string;
  da_doi_mat_khau?: boolean;
  quyen_admin?: boolean;
  auto_create_class?: boolean;
  ten_lop_hien_thi?: string;
};

export type ClassImportRow = ImportPreviewRowBase & {
  lop_id?: string;
  ten_lop: string;
  khoi: string;
  mo_ta?: string;
  diem_truong?: string;
  si_so?: number;
  ma_vemis?: string;
  giao_vien_chu_nhiem?: string;
  ten_dang_nhap_gvcn?: string;
  mo_hinh?: string;
  nam_hoc?: string;
  trang_thai: 'active' | 'inactive';
};

export type SubjectImportRow = ImportPreviewRowBase & {
  mon_id?: string;
  ten_mon: string;
  khoi_ap_dung: string;
  trang_thai: 'active' | 'inactive';
};

export type ImportPreviewRow = AccountImportRow | ClassImportRow | SubjectImportRow;

export interface ImportPreviewResult<T extends ImportPreviewRow = ImportPreviewRow> {
  entity: ImportEntity;
  fileName: string;
  sheetName: string;
  headers: string[];
  validRows: T[];
  issues: ImportIssue[];
  warnings: ImportIssue[];
  totalRows: number;
  createCount: number;
  updateCount: number;
  sourceType: ImportSourceType;
  detectedHeaderRow: number;
}

const SHEET_NAMES: Record<ImportEntity, string> = {
  account: 'TaiKhoan',
  class: 'LopHoc',
  subject: 'MonHoc',
};

const REQUIRED_HEADERS: Record<ImportEntity, string[]> = {
  account: ['ho_ten', 'ten_dang_nhap', 'mat_khau', 'vai_tro', 'lop_id', 'khoi', 'trang_thai'],
  class: ['ten_lop', 'khoi'],
  subject: ['ten_mon', 'khoi_ap_dung', 'trang_thai'],
};

const VNEDU_ACCOUNT_REQUIRED_HEADERS = ['ho_ten', 'ten_dang_nhap', 'ten_lop'];
const VNEDU_ACCOUNT_HINT_HEADERS = ['ma_hoc_sinh', 'tai_khoan_dinh_danh', 'so_dien_thoai', 'so_luot_dang_nhap', 'lan_dang_nhap_cuoi'];
const VNEDU_STUDENT_REQUIRED_HEADERS = ['ten_lop', 'ma_hoc_sinh', 'ho_ten', 'ngay_sinh', 'gioi_tinh'];
const VNEDU_STUDENT_HINT_HEADERS = ['so_dien_thoai'];

function toText(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toBoolean(value: unknown, fallback = false) {
  const normalized = stripVietnamese(toText(value)).toLowerCase();
  if (!normalized) return fallback;
  return ['true', '1', 'yes', 'y', 'on', 'co', 'có'].includes(normalized);
}

function stripVietnamese(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeHeader(value: unknown) {
  return toText(value)
    .replace(/^\ufeff/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function normalizeHeaderKey(value: unknown) {
  return normalizeHeader(value).toLowerCase();
}

function normalizeAliasKey(value: unknown) {
  return stripVietnamese(normalizeHeader(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ACCOUNT_HEADER_ALIASES: Record<string, string> = {
  user_id: 'user_id',
  ho_ten: 'ho_ten',
  ho_va_ten: 'ho_ten',
  ten_hoc_sinh: 'ho_ten',
  ten_hs: 'ho_ten',
  ma_hoc_sinh: 'ma_hoc_sinh',
  ma_hs: 'ma_hoc_sinh',
  ngay_sinh: 'ngay_sinh',
  gioi_tinh: 'gioi_tinh',
  lop_hoc: 'ten_lop',
  lop: 'ten_lop',
  ten_lop: 'ten_lop',
  lop_id: 'lop_id',
  tai_khoan: 'ten_dang_nhap',
  tai_khoan_dang_nhap: 'ten_dang_nhap',
  ten_dang_nhap: 'ten_dang_nhap',
  username: 'ten_dang_nhap',
  tk_theo_ma_dinh_danh: 'tai_khoan_dinh_danh',
  ma_dinh_danh: 'tai_khoan_dinh_danh',
  tai_khoan_dinh_danh: 'tai_khoan_dinh_danh',
  mat_khau: 'mat_khau',
  mat_khau_khoi_tao: 'mat_khau_khoi_tao',
  password: 'mat_khau',
  so_luot_truy_cap: 'so_luot_dang_nhap',
  so_luot_dang_nhap: 'so_luot_dang_nhap',
  hoat_dong_gan_nhat_gan_nhat: 'lan_dang_nhap_cuoi',
  hoat_dong_gan_nhat: 'lan_dang_nhap_cuoi',
  lan_dang_nhap_cuoi: 'lan_dang_nhap_cuoi',
  so_dien_thoai_sll: 'so_dien_thoai',
  dien_thoai_sll: 'so_dien_thoai',
  sdt_sll: 'so_dien_thoai',
  sdt_lien_lac: 'so_dien_thoai',
  so_dien_thoai: 'so_dien_thoai',
  dien_thoai_hs: 'so_dien_thoai_hoc_sinh',
  dien_thoai_bo: 'so_dien_thoai_bo',
  dien_thoai_me: 'so_dien_thoai_me',
  vai_tro: 'vai_tro',
  khoi: 'khoi',
  trang_thai: 'trang_thai',
  ghi_chu: 'ghi_chu',
  nguon_du_lieu: 'nguon_du_lieu',
  da_doi_mat_khau: 'da_doi_mat_khau',
  quyen_admin: 'quyen_admin',
  phan_quyen_admin: 'quyen_admin',
  quyen_quan_tri: 'quyen_admin',
};

const CLASS_HEADER_ALIASES: Record<string, string> = {
  stt: '__ignore',
  lop_id: 'lop_id',
  ma_lop: 'lop_id',
  ten_lop: 'ten_lop',
  lop_hoc: 'ten_lop',
  khoi: 'khoi',
  khoi_hoc: 'khoi',
  mo_ta: 'mo_ta',
  diem_truong: 'diem_truong',
  si_so: 'si_so',
  sy_so: 'si_so',
  ma_vemis: 'ma_vemis',
  giao_vien_chu_nhiem: 'giao_vien_chu_nhiem',
  gvcn: 'giao_vien_chu_nhiem',
  ten_dang_nhap_cua_gvcn: 'ten_dang_nhap_gvcn',
  ten_dang_nhap_gvcn: 'ten_dang_nhap_gvcn',
  mo_hinh: 'mo_hinh',
  nam_hoc: 'nam_hoc',
  trang_thai: 'trang_thai',
};

function canonicalHeaderKey(header: unknown, entity: ImportEntity) {
  const normalized = normalizeAliasKey(header);
  if (entity === 'account') return ACCOUNT_HEADER_ALIASES[normalized] || normalized;
  if (entity === 'class') return CLASS_HEADER_ALIASES[normalized] || normalized;
  return normalized;
}

function normalizeStatus(value: unknown) {
  const normalized = toText(value).toLowerCase();
  if (!normalized) return '';
  if (['inactive', 'tam_khoa', 'tạm khóa', 'khoa', 'khóa', 'locked', '0'].includes(normalized)) return 'inactive';
  if (['active', 'hoat_dong', 'hoạt động', 'dang_hoat_dong', '1'].includes(normalized)) return 'active';
  return '';
}

function normalizeRole(value: unknown) {
  const normalized = normalizeAliasKey(value);
  if (!normalized) return '';
  if (normalized === 'admin' || normalized === 'quan_tri' || normalized === 'quan_tri_vien') return 'admin';
  if (normalized === 'teacher' || normalized === 'giao_vien') return 'teacher';
  if (normalized === 'student' || normalized === 'hoc_sinh' || normalized === 'hs') return 'student';
  return '';
}

function normalizeGrade(value: unknown) {
  return toText(value).replace(/\.0$/, '');
}

function normalizeGradesList(value: unknown) {
  return sortGrades(
    toText(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/\.0$/, ''))
  ).join(',');
}

function isSupportedGrade(value: unknown) {
  return SUPPORTED_GRADES.includes(normalizeGrade(value));
}

function normalizeClassName(value: unknown) {
  const text = toText(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^lớp\s*/i, '')
    .replace(/^lop\s*/i, '')
    .replace(/\s+/g, '');
  if (!text) return '';
  const match = text.match(/^(\d{1,2})[\/\-_.]?(\d{1,2}|[A-Za-z])$/);
  if (match) return `${match[1]}/${match[2].toUpperCase()}`;
  return text;
}

function classCompareKey(value: unknown) {
  const text = stripVietnamese(toText(value))
    .toLowerCase()
    .replace(/^lop\s*/i, '')
    .replace(/\s+/g, '');
  if (!text) return '';
  const idMatch = text.match(/^l(\d{1,2})_0*(\d{1,2})$/i);
  if (idMatch) return `${Number(idMatch[1])}c${Number(idMatch[2])}`;
  const classMatch = text.match(/^(\d{1,2})(?:c|\/|-|_|\.)(\d{1,2})$/i);
  if (classMatch) return `${Number(classMatch[1])}c${Number(classMatch[2])}`;
  return text;
}

function normalizeBirthDate(value: unknown) {
  const text = toText(value);
  if (!text) return '';
  const slash = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? Number(`20${slash[3]}`) : Number(slash[3]);
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
    return '';
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return normalizeBirthDate(`${iso[3]}/${iso[2]}/${iso[1]}`);
  return '';
}

function normalizeGender(value: unknown) {
  const normalized = normalizeAliasKey(value);
  if (normalized === 'nam' || normalized === 'male') return 'Nam';
  if (normalized === 'nu' || normalized === 'female') return 'Nữ';
  return '';
}

function normalizePhone(value: unknown) {
  const digits = toText(value).replace(/[^0-9]/g, '');
  return digits;
}

function deriveGradeFromClassName(value: unknown) {
  const normalized = normalizeClassName(value);
  const match = normalized.match(/^(\d{1,2})/);
  return match ? match[1] : '';
}

function looksLikeIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function looksLikeSlashDate(value: string) {
  return /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(value);
}

function deriveClassNameFromId(lopId?: string, khoi?: string) {
  const match = String(lopId || '').match(/^L(\d+)_(\d+)$/i);
  if (!match) return '';
  const grade = khoi || match[1] || '';
  const index = String(parseInt(match[2], 10));
  if (!grade || !index || index === 'NaN') return '';
  return `${grade}/${index}`;
}

function fixClassName(rawName: unknown, lopId?: string, khoi?: string) {
  const text = toText(rawName);
  if (!text) return deriveClassNameFromId(lopId, khoi);
  if (looksLikeIsoDate(text) || looksLikeSlashDate(text)) {
    const derived = deriveClassNameFromId(lopId, khoi);
    return derived || text;
  }
  return text;
}

function getSheetMatrix(sheet: WorkSheet, xlsx: typeof import('xlsx')) {
  return xlsx.utils.sheet_to_json<(string | number | boolean)[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: true,
    raw: false,
  });
}

function headerScore(headers: string[], entity: ImportEntity) {
  const canonical = headers.map((header) => canonicalHeaderKey(header, entity));
  if (entity === 'account') {
    const vneduScore = VNEDU_ACCOUNT_REQUIRED_HEADERS.filter((header) => canonical.includes(header)).length +
      VNEDU_ACCOUNT_HINT_HEADERS.filter((header) => canonical.includes(header)).length * 0.25;
    const studentRosterScore = VNEDU_STUDENT_REQUIRED_HEADERS.filter((header) => canonical.includes(header)).length +
      VNEDU_STUDENT_HINT_HEADERS.filter((header) => canonical.includes(header)).length * 0.25;
    const systemScore = REQUIRED_HEADERS.account.filter((header) => canonical.includes(header)).length;
    return Math.max(vneduScore, studentRosterScore, systemScore);
  }
  return REQUIRED_HEADERS[entity].filter((header) => canonical.includes(header)).length;
}

function detectSheetAndHeaderRow(workbook: WorkBook, entity: ImportEntity, xlsx: typeof import('xlsx')) {
  const expectedSheet = SHEET_NAMES[entity];
  const exactMatch = workbook.SheetNames.find((name) => normalizeHeaderKey(name) === normalizeHeaderKey(expectedSheet));
  const orderedNames = exactMatch
    ? [exactMatch, ...workbook.SheetNames.filter((name) => name !== exactMatch)]
    : [...workbook.SheetNames];

  let bestMatch: {
    sheetName: string;
    rows: (string | number | boolean)[][];
    headers: string[];
    headerRowIndex: number;
    score: number;
  } | null = null;

  for (const sheetName of orderedNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = getSheetMatrix(sheet, xlsx);
    const scanLimit = Math.min(rows.length, 12);

    for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
      const candidateHeaders = (rows[rowIndex] || []).map(normalizeHeader);
      const score = headerScore(candidateHeaders, entity);

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { sheetName, rows, headers: candidateHeaders, headerRowIndex: rowIndex, score };
      }

      const successScore = entity === 'account' ? 4.5 : REQUIRED_HEADERS[entity].length;
      if (score >= successScore) {
        return { sheetName, rows, headers: candidateHeaders, headerRowIndex: rowIndex };
      }
    }
  }

  if (bestMatch && bestMatch.score > 0) {
    return {
      sheetName: bestMatch.sheetName,
      rows: bestMatch.rows,
      headers: bestMatch.headers,
      headerRowIndex: bestMatch.headerRowIndex,
    };
  }

  throw new Error('Không tìm thấy danh sách học sinh hợp lệ. File cần có các cột: Lớp, Mã học sinh, Họ tên, Ngày sinh và Giới tính; Số điện thoại là cột không bắt buộc.');
}

function buildSheetRows(file: File, entity: ImportEntity) {
  return Promise.all([file.arrayBuffer(), import('xlsx')]).then(([buffer, xlsx]) => {
    const workbook = xlsx.read(buffer, { type: 'array', cellDates: false, raw: false });
    const detected = detectSheetAndHeaderRow(workbook, entity, xlsx);
    const dataRows = detected.rows.slice(detected.headerRowIndex + 1);
    return { headers: detected.headers, dataRows, sheetName: detected.sheetName, headerRowIndex: detected.headerRowIndex };
  });
}

function buildCanonicalRow(headers: string[], values: unknown[], entity: ImportEntity) {
  const row: Record<string, unknown> = {};
  headers.forEach((header, cellIndex) => {
    const key = canonicalHeaderKey(header, entity);
    if (!key) return;
    if (row[key] === undefined || toText(row[key]) === '') row[key] = values[cellIndex];
  });
  return row;
}

function isVneduAccountFile(headers: string[]) {
  const canonical = headers.map((header) => canonicalHeaderKey(header, 'account'));
  return canonical.includes('ma_hoc_sinh') && canonical.includes('ten_lop') && canonical.includes('ten_dang_nhap');
}

function isVneduStudentRoster(headers: string[]) {
  const canonical = headers.map((header) => canonicalHeaderKey(header, 'account'));
  return VNEDU_STUDENT_REQUIRED_HEADERS.every((header) => canonical.includes(header));
}

function parseNumber(value: unknown) {
  const n = parseInt(toText(value).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function validateImportFile(
  file: File,
  entity: ImportEntity,
  context: { accounts: Account[]; classes: CatalogClass[]; subjects: Subject[] },
): Promise<ImportPreviewResult> {
  const { headers, dataRows, sheetName, headerRowIndex } = await buildSheetRows(file, entity);
  const issues: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const vneduAccountFile = entity === 'account' && isVneduAccountFile(headers);
  const vneduStudentRoster = entity === 'account' && isVneduStudentRoster(headers);
  const sourceType: ImportSourceType = vneduStudentRoster
    ? 'vnedu_student_roster'
    : vneduAccountFile ? 'vnedu_account' : 'edusmart';
  const canonicalHeaderKeys = headers.map((header) => canonicalHeaderKey(header, entity));
  const requiredHeaders = entity === 'account'
    ? vneduStudentRoster
      ? VNEDU_STUDENT_REQUIRED_HEADERS
      : vneduAccountFile ? VNEDU_ACCOUNT_REQUIRED_HEADERS : REQUIRED_HEADERS.account
    : REQUIRED_HEADERS[entity];

  requiredHeaders.forEach((header) => {
    if (!canonicalHeaderKeys.includes(header)) {
      issues.push({ rowNumber: 1, field: header, message: `Thiếu cột bắt buộc: ${header}` });
    }
  });

  if (issues.length > 0) {
    return {
      entity,
      fileName: file.name,
      sheetName,
      headers,
      validRows: [],
      issues,
      warnings,
      totalRows: Math.max(dataRows.length, 0),
      createCount: 0,
      updateCount: 0,
      sourceType,
      detectedHeaderRow: headerRowIndex + 1,
    };
  }

  const accountIds = new Set(context.accounts.map((item) => item.user_id));
  const usernames = new Map(context.accounts.map((item) => [item.ten_dang_nhap.toLowerCase(), item.user_id]));
  const studentCodes = new Map(context.accounts.filter((item) => item.ma_hoc_sinh).map((item) => [String(item.ma_hoc_sinh).toLowerCase(), item.user_id]));
  const classIds = new Set(context.classes.map((item) => item.lop_id));
  const classMap = new Map(context.classes.map((item) => [item.lop_id, item]));
  const classNameKeys = new Map<string, string>();
  context.classes.forEach((item) => {
    const grade = normalizeGrade(item.khoi);
    [item.ten_lop, item.lop_id].forEach((value) => {
      const key = classCompareKey(value);
      if (grade && key) classNameKeys.set(`${grade}::${key}`, item.lop_id);
    });
  });
  const classLabelById = new Map(context.classes.map((item) => [item.lop_id, item.ten_lop || item.lop_id]));
  const subjectIds = new Set(context.subjects.map((item) => item.mon_id));
  const subjectNameKeys = new Map(context.subjects.map((item) => [String(item.ten_mon).toLowerCase(), item.mon_id]));

  const fileAccountUsernames = new Set<string>();
  const fileStudentCodes = new Set<string>();
  const fileClassKeys = new Set<string>();
  const fileSubjectKeys = new Set<string>();
  const validRows: ImportPreviewRow[] = [];
  let totalDataRows = 0;

  for (let index = 0; index < dataRows.length; index += 1) {
    const rowValues = dataRows[index] || [];
    const rowNumber = headerRowIndex + index + 2;
    const row = buildCanonicalRow(headers, rowValues, entity);

    if (Object.values(row).every((value) => toText(value) === '')) continue;

    if (entity === 'account') {
      const user_id = toText(row.user_id);
      const ma_hoc_sinh = toText(row.ma_hoc_sinh);
      const ho_ten = toText(row.ho_ten);
      const ten_dang_nhap = vneduStudentRoster ? ma_hoc_sinh : toText(row.ten_dang_nhap);
      if (vneduStudentRoster && !ma_hoc_sinh && !ho_ten && !toText(row.ten_lop)) continue;
      totalDataRows += 1;
      const rawMatKhauKhoiTao = toText(row.mat_khau_khoi_tao);
      const normalizedPasswordText = stripVietnamese(rawMatKhauKhoiTao).toLowerCase();
      const usableMatKhauKhoiTao = normalizedPasswordText.includes('da doi') || normalizedPasswordText.includes('doi mk') ? '' : rawMatKhauKhoiTao;
      const fallbackVneduPassword = vneduStudentRoster ? ma_hoc_sinh : vneduAccountFile ? '123456' : '';
      const mat_khau_khoi_tao = usableMatKhauKhoiTao || fallbackVneduPassword;
      const mat_khau = toText(row.mat_khau) || mat_khau_khoi_tao;
      const vai_tro = normalizeRole(row.vai_tro) || (vneduAccountFile || vneduStudentRoster ? 'student' : '');
      const ten_lop = normalizeClassName(row.ten_lop);
      const khoi = normalizeGrade(row.khoi) || deriveGradeFromClassName(ten_lop);
      const matchedClassId = ten_lop && khoi ? classNameKeys.get(`${khoi}::${classCompareKey(ten_lop)}`) : '';
      const lop_id = toText(row.lop_id) || matchedClassId || '';
      const trang_thai = normalizeStatus(row.trang_thai) || (vneduAccountFile || vneduStudentRoster ? 'active' : '');
      const ghi_chu = toText(row.ghi_chu) || (vneduStudentRoster
        ? `Nhập từ danh sách học sinh vnEdu lớp ${ten_lop || ''} - tài khoản và mật khẩu ban đầu là mã học sinh`.trim()
        : vneduAccountFile ? `Nhập từ file tài khoản vnEdu lớp ${ten_lop || ''}${usableMatKhauKhoiTao ? '' : ' - mật khẩu mặc định 123456'}`.trim() : '');
      const tai_khoan_dinh_danh = toText(row.tai_khoan_dinh_danh);
      const so_luot_dang_nhap = parseNumber(row.so_luot_dang_nhap);
      const lan_dang_nhap_cuoi = toText(row.lan_dang_nhap_cuoi);
      const so_dien_thoai = normalizePhone(row.so_dien_thoai);
      const ngay_sinh = vneduStudentRoster ? normalizeBirthDate(row.ngay_sinh) : toText(row.ngay_sinh);
      const gioi_tinh = vneduStudentRoster ? normalizeGender(row.gioi_tinh) : toText(row.gioi_tinh);
      const quyen_admin = vai_tro === 'teacher' ? toBoolean(row.quyen_admin, false) : false;
      const matchedById = user_id ? accountIds.has(user_id) : false;
      const matchedByUsername = ten_dang_nhap ? usernames.get(ten_dang_nhap.toLowerCase()) : undefined;
      const matchedByStudentCode = ma_hoc_sinh ? studentCodes.get(ma_hoc_sinh.toLowerCase()) : undefined;
      const mode: ImportMode = matchedById || (!user_id && (!!matchedByUsername || !!matchedByStudentCode)) ? 'update' : 'create';
      const normalizedId = user_id || matchedByUsername || matchedByStudentCode || '';

      if (!ho_ten) issues.push({ rowNumber, field: 'ho_ten', message: 'Họ tên không được để trống.' });
      if (!ten_dang_nhap) issues.push({ rowNumber, field: 'ma_hoc_sinh', message: 'Mã học sinh không được để trống.' });
      if (vneduStudentRoster && !/^\d{6,}$/.test(ma_hoc_sinh)) issues.push({ rowNumber, field: 'ma_hoc_sinh', message: 'Mã học sinh phải có ít nhất 6 chữ số để dùng làm tài khoản và mật khẩu.' });
      if (vneduStudentRoster && !ngay_sinh) issues.push({ rowNumber, field: 'ngay_sinh', message: 'Ngày sinh không hợp lệ; yêu cầu định dạng ngày/tháng/năm.' });
      if (vneduStudentRoster && !gioi_tinh) issues.push({ rowNumber, field: 'gioi_tinh', message: 'Giới tính chỉ nhận Nam hoặc Nữ.' });
      if (vneduStudentRoster && !so_dien_thoai) warnings.push({ rowNumber, field: 'so_dien_thoai', message: 'Học sinh chưa có Điện thoại SLL; tài khoản vẫn được phép tạo.' });
      if (vneduStudentRoster && so_dien_thoai && !/^0\d{9}$/.test(so_dien_thoai)) warnings.push({ rowNumber, field: 'so_dien_thoai', message: 'Số điện thoại SLL không đúng 10 chữ số; hệ thống sẽ giữ dữ liệu đã chuẩn hóa để quản trị viên kiểm tra.' });
      if (mode === 'create' && !mat_khau) issues.push({ rowNumber, field: 'mat_khau', message: 'Mật khẩu không được để trống khi thêm mới.' });
      if (!vai_tro) issues.push({ rowNumber, field: 'vai_tro', message: 'Vai trò chỉ nhận admin, teacher hoặc student.' });
      if (!trang_thai) issues.push({ rowNumber, field: 'trang_thai', message: 'Trạng thái chỉ nhận active hoặc inactive.' });

      if (ten_dang_nhap) {
        const usernameKey = ten_dang_nhap.toLowerCase();
        if (fileAccountUsernames.has(usernameKey)) {
          issues.push({ rowNumber, field: 'ten_dang_nhap', message: 'Tên đăng nhập bị lặp trong file nhập.' });
        }
        fileAccountUsernames.add(usernameKey);
        if (mode === 'create' && usernames.has(usernameKey)) {
          issues.push({ rowNumber, field: 'ten_dang_nhap', message: 'Tên đăng nhập đã tồn tại trong hệ thống.' });
        }
      }

      if (ma_hoc_sinh) {
        const studentCodeKey = ma_hoc_sinh.toLowerCase();
        if (fileStudentCodes.has(studentCodeKey)) {
          issues.push({ rowNumber, field: 'ma_hoc_sinh', message: 'Mã học sinh bị lặp trong file nhập.' });
        }
        fileStudentCodes.add(studentCodeKey);
        if (mode === 'create' && studentCodes.has(studentCodeKey)) {
          issues.push({ rowNumber, field: 'ma_hoc_sinh', message: 'Mã học sinh đã tồn tại trong hệ thống.' });
        }
      }

      if (vai_tro === 'student') {
        if (!khoi || !isSupportedGrade(khoi)) {
          issues.push({ rowNumber, field: 'khoi', message: `Khối của học sinh phải nằm trong danh sách ${SUPPORTED_GRADES.join(', ')}.` });
        }
        if (!lop_id && !ten_lop) {
          issues.push({ rowNumber, field: 'lop_id', message: 'Tài khoản học sinh phải có lớp học.' });
        } else if (ten_lop && !matchedClassId && !toText(row.lop_id)) {
          issues.push({ rowNumber, field: 'ten_lop', message: `Lớp ${ten_lop} chưa tồn tại trong danh mục Lớp học. Vui lòng tạo hoặc đổi tên lớp trước khi nhập.` });
        } else if (lop_id && !classIds.has(lop_id)) {
          issues.push({ rowNumber, field: 'lop_id', message: `Lớp ${lop_id} không tồn tại trong hệ thống.` });
        } else if (lop_id) {
          const classRow = classMap.get(lop_id);
          if (classRow && normalizeGrade(classRow.khoi) !== khoi) {
            issues.push({ rowNumber, field: 'lop_id', message: `Lớp ${classRow.ten_lop || lop_id} không thuộc khối ${khoi}.` });
          }
        }
      }

      if (vai_tro === 'teacher') {
        if (!khoi || !isSupportedGrade(khoi)) {
          issues.push({ rowNumber, field: 'khoi', message: `Giáo viên phải được gán một khối hợp lệ trong danh sách ${SUPPORTED_GRADES.join(', ')}.` });
        }
        if (lop_id) {
          issues.push({ rowNumber, field: 'lop_id', message: 'Tài khoản giáo viên không được gắn trực tiếp với lớp học.' });
        }
      }

      if (vai_tro === 'admin') {
        if (khoi) issues.push({ rowNumber, field: 'khoi', message: 'Tài khoản admin không cần gán khối.' });
        if (lop_id) issues.push({ rowNumber, field: 'lop_id', message: 'Tài khoản admin không được gắn lớp học.' });
      }

      validRows.push({
        __rowNumber: rowNumber,
        __mode: mode,
        user_id: normalizedId || undefined,
        ho_ten,
        ten_dang_nhap,
        mat_khau: vneduStudentRoster && mode === 'update' ? '' : mat_khau,
        vai_tro: (vai_tro || 'student') as 'admin' | 'teacher' | 'student',
        lop_id: vai_tro === 'student' ? lop_id : '',
        ten_lop: vai_tro === 'student' ? (lop_id ? (classLabelById.get(lop_id) || ten_lop) : ten_lop) : '',
        ten_lop_hien_thi: vai_tro === 'student' && lop_id ? `Khối ${khoi} - Lớp ${classLabelById.get(lop_id) || lop_id}` : '',
        khoi: vai_tro === 'admin' ? '' : khoi,
        trang_thai: (trang_thai || 'active') as 'active' | 'inactive',
        ghi_chu,
        ma_hoc_sinh,
        ngay_sinh,
        gioi_tinh,
        tai_khoan_dinh_danh,
        mat_khau_khoi_tao: vneduStudentRoster && mode === 'update' ? '' : (mat_khau_khoi_tao || mat_khau),
        so_luot_dang_nhap,
        lan_dang_nhap_cuoi,
        so_dien_thoai,
        nguon_du_lieu: vneduStudentRoster ? 'vnedu_student_roster' : vneduAccountFile ? 'vnedu' : toText(row.nguon_du_lieu),
        da_doi_mat_khau: mode === 'create' ? false : undefined,
        quyen_admin,
        auto_create_class: false,
      } satisfies AccountImportRow);
      continue;
    }

    if (entity === 'class') {
      totalDataRows += 1;
      const lop_id = toText(row.lop_id);
      const khoi = normalizeGrade(row.khoi);
      const ten_lop = fixClassName(row.ten_lop, lop_id, khoi);
      const mo_ta = toText(row.mo_ta);
      const trang_thai = normalizeStatus(row.trang_thai) || 'active';
      const si_so = parseNumber(row.si_so);
      const matchedById = lop_id ? classIds.has(lop_id) : false;
      const key = `${khoi}::${classCompareKey(ten_lop)}`;
      const matchedByName = classNameKeys.get(key);
      const mode: ImportMode = matchedById || (!lop_id && !!matchedByName) ? 'update' : 'create';
      const normalizedId = lop_id || matchedByName || '';

      if (!ten_lop) issues.push({ rowNumber, field: 'ten_lop', message: 'Tên lớp không được để trống.' });
      if (!khoi || !isSupportedGrade(khoi)) issues.push({ rowNumber, field: 'khoi', message: `Khối lớp chỉ nhận các giá trị ${SUPPORTED_GRADES.join(', ')}.` });
      if (toText(row.trang_thai) && !normalizeStatus(row.trang_thai)) issues.push({ rowNumber, field: 'trang_thai', message: 'Trạng thái chỉ nhận active hoặc inactive.' });
      if (toText(row.si_so) && si_so < 0) issues.push({ rowNumber, field: 'si_so', message: 'Sĩ số phải là số nguyên không âm.' });
      if (ten_lop && khoi) {
        if (fileClassKeys.has(`${key}::${normalizedId || 'new'}`)) issues.push({ rowNumber, field: 'ten_lop', message: 'Tên lớp bị lặp trong cùng khối ở file nhập.' });
        fileClassKeys.add(`${key}::${normalizedId || 'new'}`);
      }

      validRows.push({
        __rowNumber: rowNumber,
        __mode: mode,
        lop_id: normalizedId || undefined,
        ten_lop,
        khoi,
        mo_ta,
        diem_truong: toText(row.diem_truong),
        si_so,
        ma_vemis: toText(row.ma_vemis),
        giao_vien_chu_nhiem: toText(row.giao_vien_chu_nhiem),
        ten_dang_nhap_gvcn: toText(row.ten_dang_nhap_gvcn),
        mo_hinh: toText(row.mo_hinh),
        nam_hoc: toText(row.nam_hoc),
        trang_thai: trang_thai as 'active' | 'inactive',
      } satisfies ClassImportRow);
      continue;
    }

    totalDataRows += 1;
    const mon_id = toText(row.mon_id);
    const ten_mon = toText(row.ten_mon);
    const khoi_ap_dung = normalizeGradesList(row.khoi_ap_dung);
    const trang_thai = normalizeStatus(row.trang_thai);
    const matchedById = mon_id ? subjectIds.has(mon_id) : false;
    const matchedByName = ten_mon ? subjectNameKeys.get(ten_mon.toLowerCase()) : undefined;
    const mode: ImportMode = matchedById || (!mon_id && !!matchedByName) ? 'update' : 'create';
    const normalizedId = mon_id || matchedByName || '';

    if (!ten_mon) issues.push({ rowNumber, field: 'ten_mon', message: 'Tên môn không được để trống.' });
    if (!khoi_ap_dung) {
      issues.push({ rowNumber, field: 'khoi_ap_dung', message: 'Khối áp dụng không được để trống.' });
    } else {
      const values = khoi_ap_dung.split(',').map((item) => item.trim()).filter(Boolean);
      const invalid = values.some((item) => !isSupportedGrade(item));
      if (invalid) issues.push({ rowNumber, field: 'khoi_ap_dung', message: `Khối áp dụng chỉ nhận danh sách khối hợp lệ từ ${SUPPORTED_GRADES.join(', ')}.` });
    }
    if (!trang_thai) issues.push({ rowNumber, field: 'trang_thai', message: 'Trạng thái chỉ nhận active hoặc inactive.' });
    if (ten_mon) {
      const nameKey = ten_mon.toLowerCase();
      if (fileSubjectKeys.has(`${nameKey}::${normalizedId || 'new'}`)) issues.push({ rowNumber, field: 'ten_mon', message: 'Tên môn bị lặp trong file nhập.' });
      fileSubjectKeys.add(`${nameKey}::${normalizedId || 'new'}`);
    }

    validRows.push({ __rowNumber: rowNumber, __mode: mode, mon_id: normalizedId || undefined, ten_mon, khoi_ap_dung, trang_thai: (trang_thai || 'active') as 'active' | 'inactive' } satisfies SubjectImportRow);
  }

  const createCount = validRows.filter((item) => item.__mode === 'create').length;
  const updateCount = validRows.filter((item) => item.__mode === 'update').length;
  const previewHeaders = validRows[0]
    ? Object.keys(validRows[0]).filter((key) => !key.startsWith('__') && key !== 'auto_create_class').slice(0, 10)
    : headers;

  return {
    entity,
    fileName: file.name,
    sheetName,
    headers: previewHeaders,
    validRows: issues.length > 0 ? [] : validRows,
    issues,
    warnings,
    totalRows: totalDataRows,
    createCount,
    updateCount,
    sourceType,
    detectedHeaderRow: headerRowIndex + 1,
  };
}
