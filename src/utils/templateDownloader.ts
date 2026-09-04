import type { Row, Worksheet } from 'exceljs';
import { DEFAULT_ACTIVE_GRADES, SUPPORTED_GRADES } from '../constants';
import type { CatalogClass } from '../types';
import type { ImportEntity } from './importValidators';

type TemplateConfig = {
  fileName: string;
  sheetName: string;
  description: string[];
  headers: string[];
  sampleRows: (string | number)[][];
  columnWidths?: number[];
  validations?: Array<{
    columnKey: string;
    values: string[];
    allowBlank?: boolean;
    promptTitle?: string;
    prompt?: string;
    errorTitle?: string;
    error?: string;
  }>;
};

const GRADE_OPTIONS = SUPPORTED_GRADES;
const STATUS_OPTIONS = ['active', 'inactive'];
const ROLE_OPTIONS = ['admin', 'teacher', 'student'];

const TEMPLATE_CONFIG: Record<ImportEntity, TemplateConfig> = {
  account: {
    fileName: 'Mau_Nhap_TaiKhoan.xlsx',
    sheetName: 'TaiKhoan',
    description: [
      'Có thể dùng mẫu này hoặc nhập trực tiếp file danh sách học sinh xuất từ vnEdu (.xls/.xlsx).',
      'Với học sinh: tên đăng nhập, mật khẩu ban đầu và mật khẩu sau khi quản trị đặt lại đều là Mã học sinh.',
      'Khi nhập lại học sinh đã tồn tại, hệ thống chỉ cập nhật hồ sơ và lớp; không tự đặt lại mật khẩu đang dùng.',
      'Với mẫu hệ thống, cột bắt buộc: ho_ten, ten_dang_nhap, mat_khau, vai_tro, lop_id hoặc ten_lop, khoi, trang_thai.',
      'Với file vnEdu, hệ thống chỉ lấy: Lớp, Mã học sinh, Họ tên, Ngày sinh, Giới tính và Số điện thoại.',
      'Lớp trong file vnEdu phải khớp với danh mục lớp hiện có; hệ thống không tự tạo lớp ngoài ý muốn.',
      'Nếu để trống user_id, hệ thống sẽ tạo mới. Nếu trùng tên đăng nhập hoặc mã học sinh, hệ thống sẽ cập nhật.',
    ],
    headers: ['user_id', 'ma_hoc_sinh', 'ho_ten', 'ngay_sinh', 'gioi_tinh', 'ten_dang_nhap', 'tai_khoan_dinh_danh', 'mat_khau', 'mat_khau_khoi_tao', 'vai_tro', 'quyen_admin', 'lop_id', 'ten_lop', 'khoi', 'trang_thai', 'so_dien_thoai', 'nguon_du_lieu', 'ghi_chu'],
    sampleRows: [
      ['', '2100175651', 'Nguyễn Văn A', '30/06/2014', 'Nam', '2100175651', '', '2100175651', '2100175651', 'student', '', '', '6C1', '6', 'active', '0377243443', 'vnedu', 'Tài khoản học sinh nhập theo lớp'],
      ['GV_001', '', 'Nguyễn Thị Lan', '', '', 'gv_lan', '', '123456', '123456', 'teacher', 'true', '', '', '9', 'active', '', 'manual', 'Giáo viên được cấp quyền admin'],
      ['ADMIN_001', '', 'Quản trị hệ thống', '', '', 'admin', '', '', '', 'admin', '', '', '', '', 'active', '', 'manual', 'Ví dụ cập nhật admin theo mã'],
    ],
    validations: [
      {
        columnKey: 'vai_tro',
        values: ROLE_OPTIONS,
        promptTitle: 'Chọn vai trò',
        prompt: 'Chọn admin, teacher hoặc student từ danh sách.',
        errorTitle: 'Vai trò không hợp lệ',
        error: 'Vui lòng chọn vai_tro từ danh sách có sẵn.',
      },
      {
        columnKey: 'khoi',
        values: GRADE_OPTIONS,
        allowBlank: true,
        promptTitle: 'Chọn khối',
        prompt: `Nếu là học sinh hoặc giáo viên, hãy chọn khối từ danh sách ${GRADE_OPTIONS.join(', ')}.`,
        errorTitle: 'Khối không hợp lệ',
        error: 'Vui lòng chọn khoi hợp lệ. Teacher và student phải có khoi, admin có thể để trống.',
      },
      {
        columnKey: 'trang_thai',
        values: STATUS_OPTIONS,
        promptTitle: 'Chọn trạng thái',
        prompt: 'Chọn active hoặc inactive từ danh sách.',
        errorTitle: 'Trạng thái không hợp lệ',
        error: 'Vui lòng chọn trang_thai từ danh sách có sẵn.',
      },
    ],
  },
  class: {
    fileName: 'Mau_Nhap_Xuat_Danh_Sach_Lop.xlsx',
    sheetName: 'LopHoc',
    description: [
      'Hệ thống nhận cả tên cột tiếng Việt như file vnEdu và tên cột kỹ thuật của các phiên bản cũ.',
      'Chỉ bắt buộc hai cột Tên lớp và Khối học. Nếu để trống Trạng thái, hệ thống mặc định là Hoạt động.',
      'Tên lớp được khóa định dạng text để tránh Excel đổi 9/1 thành ngày.',
      'Nếu để trống Mã lớp, hệ thống tự tạo mã ổn định từ tên lớp. Nếu Mã lớp đã tồn tại, hệ thống cập nhật bản ghi.',
      'Có thể nhập trực tiếp file .xls/.xlsx có các cột: STT, Khối học, Tên lớp, Điểm trường, Sỹ/Sĩ số, Mã Vemis, Giáo viên chủ nhiệm, Tên đăng nhập của GVCN, Mô hình.',
    ],
    headers: ['STT', 'Khối học', 'Tên lớp', 'Điểm trường', 'Sĩ số', 'Mã Vemis', 'Giáo viên chủ nhiệm', 'Tên đăng nhập của GVCN', 'Mô hình', 'Mã lớp', 'Trạng thái', 'Năm học', 'Mô tả'],
    sampleRows: [
      [1, '6', '6C1', '', 44, '', 'Nguyễn Văn A', 'nguyenvana', '', '', 'active', '', 'Lớp 6C1'],
      [2, '7', '7C1', '', 42, '', 'Trần Thị B', 'tranthib', '', 'L7_C1', 'active', '', 'Lớp 7C1'],
    ],
    columnWidths: [8, 12, 14, 20, 10, 16, 28, 30, 18, 16, 16, 16, 24],
    validations: [
      {
        columnKey: 'Khối học',
        values: GRADE_OPTIONS,
        promptTitle: 'Chọn khối',
        prompt: `Chọn khối từ danh sách ${GRADE_OPTIONS.join(', ')}.`,
        errorTitle: 'Khối không hợp lệ',
        error: 'Vui lòng chọn khoi từ danh sách có sẵn.',
      },
      {
        columnKey: 'Trạng thái',
        values: STATUS_OPTIONS,
        promptTitle: 'Chọn trạng thái',
        prompt: 'Chọn active hoặc inactive từ danh sách.',
        errorTitle: 'Trạng thái không hợp lệ',
        error: 'Vui lòng chọn trang_thai từ danh sách có sẵn.',
      },
    ],
  },
  subject: {
    fileName: 'Mau_Nhap_MonHoc.xlsx',
    sheetName: 'MonHoc',
    description: [
      'Nhập đúng theo mẫu. Không đổi tên cột.',
      'Cột bắt buộc: ten_mon, khoi_ap_dung, trang_thai.',
      'Cột trang_thai có danh sách chọn sẵn. Riêng khoi_ap_dung nhập thủ công theo dạng danh sách khối, phân tách bằng dấu phẩy.',
      `Ví dụ khoi_ap_dung: ${DEFAULT_ACTIVE_GRADES.join(',')} hoặc 10,11,12 hoặc 1,2,3,4,5.`,
      'Nếu để trống mon_id, hệ thống sẽ tạo mới. Nếu mon_id đã tồn tại, hệ thống sẽ cập nhật.',
    ],
    headers: ['mon_id', 'ten_mon', 'khoi_ap_dung', 'trang_thai'],
    sampleRows: [
      ['', 'Tiếng Anh', DEFAULT_ACTIVE_GRADES.join(','), 'active'],
      ['MON_TIN', 'Tin học', DEFAULT_ACTIVE_GRADES.join(','), 'active'],
    ],
    validations: [
      {
        columnKey: 'trang_thai',
        values: STATUS_OPTIONS,
        promptTitle: 'Chọn trạng thái',
        prompt: 'Chọn active hoặc inactive từ danh sách.',
        errorTitle: 'Trạng thái không hợp lệ',
        error: 'Vui lòng chọn trang_thai từ danh sách có sẵn.',
      },
    ],
  },
};

const DATA_ROW_COUNT = 500;

function triggerDownload(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([
    buffer,
  ], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function styleHeader(row: Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334E68' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
}

function styleDataArea(worksheet: Worksheet, rowCount: number, columnCount: number) {
  for (let rowIndex = 2; rowIndex <= rowCount + 1; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    row.height = 22;
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = row.getCell(col);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  }
}

export async function downloadTemplate(entity: ImportEntity) {
  const ExcelJS = (await import('exceljs')).default;
  const config = TEMPLATE_CONFIG[entity];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduSmart';
  workbook.created = new Date();

  const dataSheet = workbook.addWorksheet(config.sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const guideSheet = workbook.addWorksheet('HuongDan');
  const listSheet = workbook.addWorksheet('DanhMuc');

  dataSheet.columns = config.headers.map((header, index) => ({
    header,
    key: header,
    width: config.columnWidths?.[index] ?? Math.max(16, header.length + 4),
    style: header === 'ten_lop' ? { numFmt: '@' } : undefined,
  }));

  styleHeader(dataSheet.getRow(1));
  dataSheet.addRows(config.sampleRows);
  styleDataArea(dataSheet, DATA_ROW_COUNT, config.headers.length);

  // Định dạng text cho ten_lop để tránh lỗi 9/1 thành ngày.
  const classNameHeader = config.headers.includes('ten_lop') ? 'ten_lop' : config.headers.includes('Tên lớp') ? 'Tên lớp' : '';
  if (classNameHeader) {
    const column = dataSheet.getColumn(classNameHeader);
    column.numFmt = '@';
    for (let rowIndex = 2; rowIndex <= DATA_ROW_COUNT + 1; rowIndex += 1) {
      dataSheet.getRow(rowIndex).getCell(config.headers.indexOf(classNameHeader) + 1).numFmt = '@';
    }
  }

  guideSheet.columns = [{ width: 6 }, { width: 95 }];
  guideSheet.mergeCells('A1:B1');
  guideSheet.getCell('A1').value = 'HƯỚNG DẪN NHẬP DỮ LIỆU';
  guideSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1E293B' } };
  guideSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  guideSheet.getRow(1).height = 28;

  config.description.forEach((item, index) => {
    const rowNumber = index + 3;
    guideSheet.getCell(`A${rowNumber}`).value = index + 1;
    guideSheet.getCell(`B${rowNumber}`).value = item;
    guideSheet.getCell(`A${rowNumber}`).font = { bold: true };
    guideSheet.getCell(`B${rowNumber}`).alignment = { wrapText: true };
  });

  guideSheet.getCell(`A${config.description.length + 5}`).value = 'Lưu ý';
  guideSheet.getCell(`A${config.description.length + 5}`).font = { bold: true, color: { argb: 'FF1D4ED8' } };
  guideSheet.getCell(`B${config.description.length + 5}`).value = 'Các cột có danh sách chọn sẽ hiện mũi tên xổ xuống khi bấm vào ô. Hãy chọn từ danh sách, không gõ tay.';
  guideSheet.getCell(`B${config.description.length + 5}`).alignment = { wrapText: true };

  // Sheet danh mục dùng cho data validation.
  listSheet.state = 'veryHidden';
  let currentListColumn = 1;
  for (const validation of config.validations ?? []) {
    const col = listSheet.getColumn(currentListColumn);
    col.width = 20;
    const headerCell = listSheet.getCell(1, currentListColumn);
    headerCell.value = validation.columnKey;
    headerCell.font = { bold: true };
    validation.values.forEach((value, index) => {
      listSheet.getCell(index + 2, currentListColumn).value = value;
    });

    const columnLetter = col.letter;
    const formula = `'DanhMuc'!$${columnLetter}$2:$${columnLetter}$${validation.values.length + 1}`;
    const targetColumnIndex = config.headers.indexOf(validation.columnKey) + 1;
    if (targetColumnIndex > 0) {
      for (let rowIndex = 2; rowIndex <= DATA_ROW_COUNT + 1; rowIndex += 1) {
        const cell = dataSheet.getRow(rowIndex).getCell(targetColumnIndex);
        cell.dataValidation = {
          type: 'list',
          allowBlank: validation.allowBlank ?? false,
          formulae: [formula],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: validation.errorTitle ?? 'Dữ liệu không hợp lệ',
          error: validation.error ?? `Vui lòng chọn ${validation.columnKey} từ danh sách có sẵn.`,
          showInputMessage: true,
          promptTitle: validation.promptTitle ?? 'Chọn dữ liệu',
          prompt: validation.prompt ?? `Hãy chọn ${validation.columnKey} từ danh sách có sẵn.`,
        };
      }

      // Tô nhẹ cột có danh sách chọn để người dùng dễ nhận biết.
      for (let rowIndex = 2; rowIndex <= DATA_ROW_COUNT + 1; rowIndex += 1) {
        const cell = dataSheet.getRow(rowIndex).getCell(targetColumnIndex);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    }
    currentListColumn += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer as ArrayBuffer, config.fileName);
}

export async function exportClassesToExcel(items: CatalogClass[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduSmart';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('LopHoc', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = TEMPLATE_CONFIG.class.headers;
  worksheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: TEMPLATE_CONFIG.class.columnWidths?.[index] ?? Math.max(14, header.length + 3),
  }));
  styleHeader(worksheet.getRow(1));
  const sorted = [...items].sort((a, b) => {
    const gradeCompare = Number(a.khoi || 0) - Number(b.khoi || 0);
    return gradeCompare || String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi');
  });
  worksheet.addRows(sorted.map((item, index) => [
    index + 1,
    item.khoi || '',
    item.ten_lop || '',
    item.diem_truong || '',
    Number(item.si_so || 0) || '',
    item.ma_vemis || '',
    item.giao_vien_chu_nhiem || '',
    item.ten_dang_nhap_gvcn || '',
    item.mo_hinh || '',
    item.lop_id || '',
    item.trang_thai || 'active',
    item.nam_hoc || '',
    item.mo_ta || '',
  ]));
  styleDataArea(worksheet, Math.max(sorted.length, 1), headers.length);
  worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(headers.length).letter}${Math.max(sorted.length + 1, 2)}` };
  worksheet.getColumn(3).numFmt = '@';
  worksheet.getColumn(5).numFmt = '0';

  const guide = workbook.addWorksheet('HuongDan');
  guide.columns = [{ width: 6 }, { width: 100 }];
  guide.mergeCells('A1:B1');
  guide.getCell('A1').value = 'HƯỚNG DẪN NHẬP / XUẤT DANH SÁCH LỚP';
  guide.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1E293B' } };
  guide.getCell('A1').alignment = { horizontal: 'center' };
  TEMPLATE_CONFIG.class.description.forEach((item, index) => {
    guide.getCell(index + 3, 1).value = index + 1;
    guide.getCell(index + 3, 1).font = { bold: true };
    guide.getCell(index + 3, 2).value = item;
    guide.getCell(index + 3, 2).alignment = { wrapText: true, vertical: 'top' };
  });

  const date = new Date().toISOString().slice(0, 10);
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer as ArrayBuffer, `Danh_Sach_Lop_${date}.xlsx`);
}
