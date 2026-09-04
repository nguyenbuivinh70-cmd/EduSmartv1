import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Account, CatalogClass, Subject } from '../types';
import { type ImportEntity, type ImportPreviewResult, validateImportFile } from '../utils/importValidators';

interface ImportDataModalProps {
  isOpen: boolean;
  entity: ImportEntity;
  accounts: Account[];
  classes: CatalogClass[];
  subjects: Subject[];
  isSubmitting?: boolean;
  executionProgress?: {
    processed: number;
    total: number;
    created: number;
    updated: number;
    failed: number;
  } | null;
  executionResult?: {
    created: number;
    updated: number;
    failed: number;
    failures: Array<{ source_row: number; ma_hoc_sinh?: string; ho_ten?: string; reason: string }>;
  } | null;
  onClose: () => void;
  onConfirm: (preview: ImportPreviewResult) => Promise<void> | void;
}

const ENTITY_LABELS: Record<ImportEntity, { title: string; sheetName: string; color: string }> = {
  account: { title: 'Tài khoản', sheetName: 'TaiKhoan', color: 'from-indigo-600 via-violet-600 to-fuchsia-600' },
  class: { title: 'Lớp học', sheetName: 'LopHoc', color: 'from-emerald-600 via-teal-500 to-cyan-500' },
  subject: { title: 'Môn học', sheetName: 'MonHoc', color: 'from-amber-500 via-orange-500 to-rose-500' },
};


const ENTITY_TIPS: Record<ImportEntity, string[]> = {
  account: [
    'Có thể nhập trực tiếp file Danh sách học sinh xuất từ vnEdu dạng .xls/.xlsx.',
    'Cột bắt buộc: Lớp, Mã học sinh, Họ tên, Ngày sinh và Giới tính. Số điện thoại là cột không bắt buộc.',
    'Tên đăng nhập, mật khẩu ban đầu và mật khẩu sau khi reset đều là Mã học sinh.',
    'Toàn bộ hồ sơ được lưu và hiển thị ngay từ Firestore; không tạo Authentication hàng loạt nên phù hợp gói Spark.',
    'Firebase Authentication tự kích hoạt khi học sinh đăng nhập lần đầu bằng Mã học sinh.',
    'Nếu lớp trong file vnEdu chưa có trong danh mục Lớp học, hệ thống sẽ báo lỗi và không nhập để tránh sinh lớp sai.',
  ],
  class: [
    'Có thể nhập trực tiếp file danh sách lớp với các cột tiếng Việt như tệp mẫu: Khối học, Tên lớp, Sỹ/Sĩ số, GVCN và Mô hình.',
    'Chỉ bắt buộc Tên lớp và Khối học; trạng thái trống sẽ mặc định là Hoạt động.',
    'Nếu cập nhật lớp cũ, nên giữ nguyên Mã lớp; nếu bỏ trống hệ thống nhận diện theo tên lớp và khối.',
  ],
  subject: [
    'khoi_ap_dung nhập dạng danh sách phân tách bằng dấu phẩy, ví dụ 6,7,8,9 hoặc 10,11,12.',
    'Nếu cập nhật môn cũ, hãy giữ nguyên mon_id để hệ thống cập nhật đúng.',
  ],
};

export default function ImportDataModal({
  isOpen,
  entity,
  accounts,
  classes,
  subjects,
  isSubmitting = false,
  executionProgress = null,
  executionResult = null,
  onClose,
  onConfirm,
}: ImportDataModalProps) {
  const [selectedFileName, setSelectedFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSelectedFileName('');
      setPreview(null);
      setErrorMessage('');
      setIsParsing(false);
    }
  }, [isOpen]);

  const entityConfig = ENTITY_LABELS[entity];
  const sampleRows = useMemo(() => (preview?.validRows || []).slice(0, 5), [preview]);

  const handleFileChange = async (file?: File | null) => {
    if (!file) return;
    setIsParsing(true);
    setSelectedFileName(file.name);
    setErrorMessage('');
    try {
      const result = await validateImportFile(file, entity, { accounts, classes, subjects });
      setPreview(result);
      if (result.issues.length > 0) {
        setErrorMessage('File có lỗi dữ liệu. Hãy sửa theo danh sách lỗi trước khi nhập.');
      }
    } catch (error) {
      setPreview(null);
      setErrorMessage(error instanceof Error ? error.message : 'Không đọc được file tải lên.');
    } finally {
      setIsParsing(false);
    }
  };

  const canImport = Boolean(preview && preview.validRows.length > 0 && preview.issues.length === 0 && !isParsing);

  const statusBanner = useMemo(() => {
    if (isSubmitting) {
      return {
        icon: LoaderCircle,
        iconClass: 'animate-spin',
        wrapperClass: 'border border-indigo-100 bg-indigo-50 text-indigo-700',
        title: executionProgress?.total
          ? `Đang lưu hồ sơ ${executionProgress.processed}/${executionProgress.total}...`
          : 'Đang nhập dữ liệu vào hệ thống...',
        description: executionProgress?.total
          ? `Đã thêm ${executionProgress.created}, cập nhật ${executionProgress.updated}, lỗi ${executionProgress.failed}. Dữ liệu thành công đang hiển thị ngay từ Firestore.`
          : 'Vui lòng chờ đến khi Firestore ghi xong danh sách học sinh.',
      };
    }
    if (executionResult) {
      return {
        icon: executionResult.failed ? AlertTriangle : CheckCircle2,
        iconClass: '',
        wrapperClass: executionResult.failed
          ? 'border border-amber-100 bg-amber-50 text-amber-700'
          : 'border border-emerald-100 bg-emerald-50 text-emerald-700',
        title: executionResult.failed ? 'Đã hoàn tất nhưng còn hồ sơ cần kiểm tra.' : 'Đã lưu danh sách học sinh thành công.',
        description: `Thêm mới ${executionResult.created}, cập nhật ${executionResult.updated}, lỗi ${executionResult.failed}. Tài khoản đăng nhập sẽ tự kích hoạt ở lần đầu.`,
      };
    }
    if (isParsing) {
      return {
        icon: LoaderCircle,
        iconClass: 'animate-spin',
        wrapperClass: 'border border-sky-100 bg-sky-50 text-sky-700',
        title: 'Đang đọc và kiểm tra file tải lên...',
        description: 'Hệ thống đang xác thực cột, dữ liệu bắt buộc và các ràng buộc trước khi nhập.',
      };
    }
    if (errorMessage) {
      return {
        icon: AlertTriangle,
        iconClass: '',
        wrapperClass: 'border border-rose-100 bg-rose-50 text-rose-700',
        title: errorMessage,
        description: 'Hãy chỉnh lại file theo đúng mẫu rồi tải lên lại để tiếp tục.',
      };
    }
    if (preview && preview.issues.length > 0) {
      return {
        icon: AlertTriangle,
        iconClass: '',
        wrapperClass: 'border border-amber-100 bg-amber-50 text-amber-700',
        title: `Phát hiện ${preview.issues.length} lỗi trong file nhập liệu.`,
        description: 'Danh sách lỗi đã hiển thị ở bên phải. Hệ thống sẽ chặn nhập cho đến khi file hợp lệ.',
      };
    }
    if (preview && preview.validRows.length > 0) {
      return {
        icon: CheckCircle2,
        iconClass: '',
        wrapperClass: 'border border-emerald-100 bg-emerald-50 text-emerald-700',
        title: 'File hợp lệ và đã sẵn sàng để nhập.',
        description: `Có ${preview.validRows.length} dòng hợp lệ, gồm ${preview.createCount} dòng thêm mới và ${preview.updateCount} dòng cập nhật.`,
      };
    }
    return {
      icon: Info,
      iconClass: '',
      wrapperClass: 'border border-slate-200 bg-slate-50 text-slate-600',
      title: 'Chọn file .xlsx/.xls từ vnEdu hoặc file mẫu để bắt đầu.',
      description: 'Hệ thống sẽ kiểm tra cột, dữ liệu bắt buộc và đối chiếu lớp trong file với danh mục Lớp học.',
    };
  }, [errorMessage, executionProgress, executionResult, isParsing, isSubmitting, preview]);

  const StatusIcon = statusBanner.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="app-modal-overlay"
        >
          <div className="app-modal-viewport">
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            className="app-modal-panel mx-auto max-w-5xl"
          >
            <div className={`flex items-start justify-between bg-gradient-to-r ${entityConfig.color} px-7 py-6 text-white`}>
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <FileSpreadsheet className="h-4 w-4" /> Nhập dữ liệu {entityConfig.title}
                </p>
                <h3 className="mt-3 text-2xl font-bold">Nhập dữ liệu {entityConfig.title.toLowerCase()} từ Excel/vnEdu</h3>
                <p className="mt-2 max-w-3xl text-sm text-white/85">
                  Hệ thống sẽ đọc đúng sheet <span className="font-semibold">{entityConfig.sheetName}</span> hoặc tự nhận dạng file vnEdu, kiểm tra cột bắt buộc và xác thực dữ liệu trước khi nhập.
                </p>
              </div>
              <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 transition hover:bg-white/25">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-slate-100 bg-white px-6 py-4">
              <div className={`flex items-start gap-3 rounded-[24px] px-4 py-3 ${statusBanner.wrapperClass}`}>
                <StatusIcon className={`mt-0.5 h-5 w-5 shrink-0 ${statusBanner.iconClass}`} />
                <div>
                  <p className="text-sm font-semibold">{statusBanner.title}</p>
                  <p className="mt-1 text-sm/6 opacity-90">{statusBanner.description}</p>
                </div>
              </div>
              {isSubmitting && executionProgress?.total ? (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.min(100, Math.round(executionProgress.processed * 100 / executionProgress.total))}%` }} />
                </div>
              ) : null}
            </div>

            <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-5 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
                <div className="rounded-[24px] border border-dashed border-indigo-200 bg-indigo-50/60 p-4">
                  <p className="text-sm font-semibold text-slate-900">Bước 1: Chọn file {entityConfig.title.toLowerCase()} cần nhập</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Chọn file Excel xuất từ hệ thống đang dùng hoặc file theo mẫu EduSmart. Nút tải file mẫu nằm ở màn hình quản lý bên ngoài popup.
                  </p>
                  <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-indigo-300 bg-white px-6 py-8 text-center transition hover:border-indigo-400 hover:bg-indigo-50">
                    <UploadCloud className="h-8 w-8 text-indigo-500" />
                    <span className="mt-3 text-sm font-semibold text-slate-900">Chọn file .xlsx/.xls để kiểm tra</span>
                    <span className="mt-1 text-xs text-slate-500">Hỗ trợ file .xlsx và .xls.</span>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void handleFileChange(e.target.files?.[0])} />
                  </label>
                  {selectedFileName && <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-medium text-slate-600">Đã chọn: <span className="font-semibold text-slate-900">{selectedFileName}</span></p>}
                </div>

                <div className="rounded-[24px] border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  <p className="font-semibold">Lưu ý nhanh trước khi nhập</p>
                  <ul className="mt-2 space-y-1.5 pl-5 text-sm leading-6">
                    {ENTITY_TIPS[entity].map((tip) => (
                      <li key={tip} className="list-disc">{tip}</li>
                    ))}
                  </ul>
                </div>

                {preview && (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">Kết quả kiểm tra</p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3"><div className="text-slate-500">Tổng số dòng</div><div className="mt-1 text-lg font-bold text-slate-900">{preview.totalRows}</div></div>
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3"><div className="text-emerald-700">Hợp lệ</div><div className="mt-1 text-lg font-bold text-emerald-800">{preview.validRows.length}</div></div>
                      <div className="rounded-2xl bg-indigo-50 px-4 py-3"><div className="text-indigo-700">Thêm mới</div><div className="mt-1 text-lg font-bold text-indigo-800">{preview.createCount}</div></div>
                      <div className="rounded-2xl bg-amber-50 px-4 py-3"><div className="text-amber-700">Cập nhật</div><div className="mt-1 text-lg font-bold text-amber-800">{preview.updateCount}</div></div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-700">
                      <p className="font-semibold">Nguồn được nhận diện</p>
                      <p className="mt-1">{preview.sourceType === 'vnedu_student_roster' ? `Danh sách học sinh vnEdu • tiêu đề tại dòng ${preview.detectedHeaderRow}` : preview.sourceType === 'vnedu_account' ? 'Danh sách tài khoản vnEdu' : `Mẫu EduSmart • tiêu đề tại dòng ${preview.detectedHeaderRow}`}</p>
                    </div>
                    {entity === 'account' && (
                      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                        <p className="font-semibold text-slate-800">Đối chiếu lớp học</p>
                        <p className="mt-1 leading-5">File chỉ được nhập nếu lớp đã tồn tại trong danh mục Lớp học. Hệ thống không tự tạo lớp mới từ danh sách học sinh.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h4 className="text-sm font-semibold text-slate-900">Bước 2: Xem trước dữ liệu và xác nhận nhập</h4>
                  <p className="mt-1 text-sm text-slate-500">Nếu có lỗi, hệ thống sẽ chặn nhập để bạn chỉnh lại file theo đúng mẫu.</p>
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                  {!preview ? (
                    <div className="flex h-64 items-center justify-center rounded-[24px] bg-slate-50 text-center text-sm text-slate-500">
                      Chọn file Excel hoặc danh sách học sinh vnEdu để xem trước dữ liệu nhập.
                    </div>
                  ) : preview.issues.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                        <AlertTriangle className="h-4 w-4" /> Phát hiện {preview.issues.length} lỗi cần sửa trước khi nhập.
                      </div>
                      <div className="overflow-hidden rounded-[20px] border border-rose-100">
                        <table className="min-w-full text-sm">
                          <thead className="bg-rose-50 text-left text-rose-700">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Dòng</th>
                              <th className="px-4 py-3 font-semibold">Trường</th>
                              <th className="px-4 py-3 font-semibold">Mô tả lỗi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.issues.slice(0, 30).map((issue, index) => (
                              <tr key={`${issue.rowNumber}-${issue.field}-${index}`} className="border-t border-rose-100 text-slate-700">
                                <td className="px-4 py-3">{issue.rowNumber}</td>
                                <td className="px-4 py-3 font-medium">{issue.field}</td>
                                <td className="px-4 py-3">{issue.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : executionResult?.failed ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">Có {executionResult.failed} hồ sơ chưa xử lý được. Các hồ sơ thành công đã được giữ nguyên.</div>
                      <div className="overflow-hidden rounded-[20px] border border-amber-100">
                        <table className="min-w-full text-sm">
                          <thead className="bg-amber-50 text-left text-amber-700"><tr><th className="px-4 py-3">Dòng</th><th className="px-4 py-3">Mã HS</th><th className="px-4 py-3">Lý do</th></tr></thead>
                          <tbody>{executionResult.failures.slice(0, 30).map((item, index) => <tr key={`${item.source_row}-${item.ma_hoc_sinh}-${index}`} className="border-t border-amber-100"><td className="px-4 py-3">{item.source_row}</td><td className="px-4 py-3 font-medium">{item.ma_hoc_sinh || '-'}</td><td className="px-4 py-3">{item.reason}</td></tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                        <FileSpreadsheet className="h-4 w-4" /> File hợp lệ. Có thể nhập/cập nhật dữ liệu vào hệ thống.
                      </div>
                      <div className="overflow-auto rounded-[20px] border border-slate-200">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-left text-slate-500">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Dòng</th>
                              <th className="px-4 py-3 font-semibold">Chế độ</th>
                              {preview.headers.slice(0, 6).map((header) => (
                                <th key={header} className="px-4 py-3 font-semibold">{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sampleRows.map((row) => (
                              <tr key={row.__rowNumber} className="border-t border-slate-100 text-slate-700">
                                <td className="px-4 py-3">{row.__rowNumber}</td>
                                <td className="px-4 py-3">
                                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.__mode === 'create' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
                                    {row.__mode === 'create' ? 'Thêm mới' : 'Cập nhật'}
                                  </span>
                                </td>
                                {preview.headers.slice(0, 6).map((header) => (
                                  <td key={header} className="px-4 py-3">{String((row as Record<string, unknown>)[header] ?? '-')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {preview.warnings.length > 0 && (
                        <div className="rounded-[20px] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
                          <p className="font-semibold">{preview.warnings.length} cảnh báo không chặn nhập</p>
                          {preview.warnings.slice(0, 10).map((warning, index) => <p key={`${warning.rowNumber}-${warning.field}-${index}`} className="mt-2">Dòng {warning.rowNumber}: {warning.message}</p>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 shadow-[0_-12px_30px_rgba(15,23,42,0.06)]">
                  <div className="text-xs text-slate-500">
                    {preview && preview.validRows.length > 0 && preview.issues.length === 0
                      ? `Sẵn sàng nhập ${preview.validRows.length} dòng (${preview.createCount} thêm mới, ${preview.updateCount} cập nhật).`
                      : 'Sau khi file hợp lệ, nút cập nhật dữ liệu sẽ được bật.'}
                  </div>
                  <div className="flex flex-wrap justify-end gap-3">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Hủy</button>
                    <button
                      type="button"
                      onClick={() => preview && void onConfirm(preview)}
                      disabled={!canImport || isSubmitting}
                      className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {(isSubmitting || isParsing) && <LoaderCircle className="h-4 w-4 animate-spin" />}
                      {entity === 'account' && preview?.sourceType === 'vnedu_student_roster' ? 'Lưu danh sách học sinh' : 'Cập nhật dữ liệu'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
