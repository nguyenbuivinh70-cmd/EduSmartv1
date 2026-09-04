import { AnimatePresence, motion } from 'motion/react';
import { GraduationCap, LoaderCircle, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CatalogClass } from '../types';
import { DEFAULT_ACTIVE_GRADES, sortGrades } from '../constants';

interface ClassFormValues {
  lop_id?: string;
  ten_lop: string;
  khoi: string;
  mo_ta: string;
  diem_truong: string;
  si_so: string;
  ma_vemis: string;
  giao_vien_chu_nhiem: string;
  ten_dang_nhap_gvcn: string;
  mo_hinh: string;
  trang_thai: string;
}

interface ClassFormModalProps {
  isOpen: boolean;
  initialData?: CatalogClass | null;
  isSubmitting?: boolean;
  availableGrades?: string[];
  onClose: () => void;
  onSubmit: (payload: any) => Promise<void> | void;
}

const INITIAL_VALUES: ClassFormValues = {
  ten_lop: '',
  khoi: DEFAULT_ACTIVE_GRADES[0],
  mo_ta: '',
  diem_truong: '',
  si_so: '',
  ma_vemis: '',
  giao_vien_chu_nhiem: '',
  ten_dang_nhap_gvcn: '',
  mo_hinh: '',
  trang_thai: 'active',
};

const fieldClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100';

export default function ClassFormModal({ isOpen, initialData, isSubmitting = false, availableGrades = DEFAULT_ACTIVE_GRADES, onClose, onSubmit }: ClassFormModalProps) {
  const gradeOptions = useMemo(() => sortGrades(availableGrades.length ? availableGrades : DEFAULT_ACTIVE_GRADES), [availableGrades]);
  const [values, setValues] = useState<ClassFormValues>(INITIAL_VALUES);

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setValues({
        lop_id: initialData.lop_id,
        ten_lop: initialData.ten_lop || '',
        khoi: initialData.khoi || gradeOptions[0] || DEFAULT_ACTIVE_GRADES[0],
        mo_ta: initialData.mo_ta || '',
        diem_truong: initialData.diem_truong || '',
        si_so: initialData.si_so ? String(initialData.si_so) : '',
        ma_vemis: initialData.ma_vemis || '',
        giao_vien_chu_nhiem: initialData.giao_vien_chu_nhiem || '',
        ten_dang_nhap_gvcn: initialData.ten_dang_nhap_gvcn || '',
        mo_hinh: initialData.mo_hinh || '',
        trang_thai: initialData.trang_thai || 'active',
      });
      return;
    }
    setValues({ ...INITIAL_VALUES, khoi: gradeOptions[0] || DEFAULT_ACTIVE_GRADES[0] });
  }, [isOpen, initialData, gradeOptions]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, si_so: values.si_so ? Number(values.si_so) : 0 });
  };

  const isEdit = Boolean(initialData?.lop_id);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="app-modal-overlay">
          <div className="app-modal-viewport">
          <motion.form initial={{ y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.96 }} onSubmit={handleSubmit} className="app-modal-panel mx-auto max-w-2xl">
            <div className="flex items-start justify-between bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-5 text-white sm:px-7 sm:py-6">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><GraduationCap className="h-4 w-4" /> {isEdit ? 'Cập nhật lớp học' : 'Tạo lớp học mới'}</p>
                <h3 className="mt-3 text-2xl font-bold">{isEdit ? 'Chỉnh sửa lớp học' : 'Thêm lớp học mới'}</h3>
                
              </div>
              <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 transition hover:bg-white/25"><X className="h-5 w-5" /></button>
            </div>
            <div className="app-modal-body app-modal-body-padded app-scrollbar">
              <div className="space-y-5">
                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Thông tin lớp học</p>
                    <p className="app-modal-section-description">Tên lớp nên thống nhất với cách gọi thực tế để dễ nhập tài khoản và đồng bộ dữ liệu từ vnEdu.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Tên lớp</span>
                      <input value={values.ten_lop} onChange={(e) => setValues((c) => ({ ...c, ten_lop: e.target.value }))} required className={fieldClassName} placeholder="Ví dụ: 6/1" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Khối</span>
                      <select value={values.khoi} onChange={(e) => setValues((c) => ({ ...c, khoi: e.target.value }))} className={fieldClassName}>
                        {gradeOptions.map((grade) => (
                          <option key={grade} value={grade}>Khối {grade}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Điểm trường</span>
                      <input value={values.diem_truong} onChange={(e) => setValues((c) => ({ ...c, diem_truong: e.target.value }))} className={fieldClassName} placeholder="Để trống nếu học tại điểm trường chính" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Sĩ số dự kiến</span>
                      <input type="number" min="0" step="1" value={values.si_so} onChange={(e) => setValues((c) => ({ ...c, si_so: e.target.value }))} className={fieldClassName} placeholder="Ví dụ: 44" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Mã Vemis</span>
                      <input value={values.ma_vemis} onChange={(e) => setValues((c) => ({ ...c, ma_vemis: e.target.value }))} className={fieldClassName} placeholder="Mã lớp trên Vemis" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Giáo viên chủ nhiệm</span>
                      <input value={values.giao_vien_chu_nhiem} onChange={(e) => setValues((c) => ({ ...c, giao_vien_chu_nhiem: e.target.value }))} className={fieldClassName} placeholder="Họ và tên giáo viên" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Tên đăng nhập GVCN</span>
                      <input value={values.ten_dang_nhap_gvcn} onChange={(e) => setValues((c) => ({ ...c, ten_dang_nhap_gvcn: e.target.value }))} className={fieldClassName} placeholder="Ví dụ: nguyenvana" />
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Mô hình lớp</span>
                      <input value={values.mo_hinh} onChange={(e) => setValues((c) => ({ ...c, mo_hinh: e.target.value }))} className={fieldClassName} placeholder="Ví dụ: Lớp tăng cường Tin học" />
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Mô tả</span>
                      <textarea value={values.mo_ta} onChange={(e) => setValues((c) => ({ ...c, mo_ta: e.target.value }))} rows={4} className={fieldClassName} placeholder="Ví dụ: Lớp 6/1 - năm học 2025-2026" />
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Trạng thái</span>
                      <select value={values.trang_thai} onChange={(e) => setValues((c) => ({ ...c, trang_thai: e.target.value }))} className={fieldClassName}>
                        <option value="active">Hoạt động</option>
                        <option value="inactive">Tạm khóa</option>
                      </select>
                    </label>
                  </div>
                </section>
              </div>
            </div>
            <div className="app-modal-footer">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Hủy</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70">
                {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Lưu cập nhật' : 'Tạo lớp học'}
              </button>
            </div>
          </motion.form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
