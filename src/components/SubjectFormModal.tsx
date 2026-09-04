import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, LoaderCircle, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Subject } from '../types';
import { DEFAULT_ACTIVE_GRADES, sortGrades } from '../constants';

interface SubjectFormValues {
  mon_id?: string;
  ten_mon: string;
  khoi_ap_dung: string;
  trang_thai: string;
}

interface SubjectFormModalProps {
  isOpen: boolean;
  initialData?: Subject | null;
  isSubmitting?: boolean;
  availableGrades?: string[];
  onClose: () => void;
  onSubmit: (payload: any) => Promise<void> | void;
}

const INITIAL_VALUES: SubjectFormValues = {
  ten_mon: '',
  khoi_ap_dung: DEFAULT_ACTIVE_GRADES.join(','),
  trang_thai: 'active',
};

const fieldClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100';

export default function SubjectFormModal({ isOpen, initialData, isSubmitting = false, availableGrades = DEFAULT_ACTIVE_GRADES, onClose, onSubmit }: SubjectFormModalProps) {
  const gradeOptions = useMemo(() => sortGrades(availableGrades.length ? availableGrades : DEFAULT_ACTIVE_GRADES), [availableGrades]);
  const [values, setValues] = useState<SubjectFormValues>(INITIAL_VALUES);
  const [grades, setGrades] = useState<string[]>(DEFAULT_ACTIVE_GRADES);

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      const nextGrades = String(initialData.khoi_ap_dung || DEFAULT_ACTIVE_GRADES.join(','))
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      setGrades(nextGrades.length > 0 ? sortGrades(nextGrades) : DEFAULT_ACTIVE_GRADES);
      setValues({
        mon_id: initialData.mon_id,
        ten_mon: initialData.ten_mon || '',
        khoi_ap_dung: initialData.khoi_ap_dung || DEFAULT_ACTIVE_GRADES.join(','),
        trang_thai: initialData.trang_thai || 'active',
      });
      return;
    }
    setGrades(gradeOptions.length ? gradeOptions : DEFAULT_ACTIVE_GRADES);
    setValues({ ...INITIAL_VALUES, khoi_ap_dung: (gradeOptions.length ? gradeOptions : DEFAULT_ACTIVE_GRADES).join(',') });
  }, [isOpen, initialData, gradeOptions]);

  useEffect(() => {
    setValues((current) => ({ ...current, khoi_ap_dung: grades.join(',') }));
  }, [grades]);

  const handleToggleGrade = (grade: string) => {
    setGrades((current) => {
      if (current.includes(grade)) {
        const next = current.filter((item) => item !== grade);
        return next.length > 0 ? next : current;
      }
      return sortGrades([...current, grade]);
    });
  };

  const gradeSummary = useMemo(() => grades.map((grade) => `Khối ${grade}`).join(', '), [grades]);
  const isEdit = Boolean(initialData?.mon_id);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, khoi_ap_dung: grades.join(',') });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="app-modal-overlay">
          <div className="app-modal-viewport">
          <motion.form initial={{ y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.96 }} onSubmit={handleSubmit} className="app-modal-panel mx-auto max-w-2xl">
            <div className="flex items-start justify-between bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white sm:px-7 sm:py-6">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><BookOpen className="h-4 w-4" /> {isEdit ? 'Cập nhật môn học' : 'Tạo môn học mới'}</p>
                <h3 className="mt-3 text-2xl font-bold">{isEdit ? 'Chỉnh sửa môn học' : 'Thêm môn học mới'}</h3>
                
              </div>
              <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 transition hover:bg-white/25"><X className="h-5 w-5" /></button>
            </div>
            <div className="app-modal-body app-modal-body-padded app-scrollbar">
              <div className="space-y-5">
                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Thông tin môn học</p>
                    <p className="app-modal-section-description">Tên môn và trạng thái sẽ được dùng ở mọi màn hình quản trị cũng như khi giáo viên tạo bài học.</p>
                  </div>
                  <div className="grid gap-4">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Tên môn</span>
                      <input value={values.ten_mon} onChange={(e) => setValues((c) => ({ ...c, ten_mon: e.target.value }))} required className={fieldClassName} placeholder="Ví dụ: Tin học" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Trạng thái</span>
                      <select value={values.trang_thai} onChange={(e) => setValues((c) => ({ ...c, trang_thai: e.target.value }))} className={fieldClassName}>
                        <option value="active">Hoạt động</option>
                        <option value="inactive">Tạm khóa</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Khối áp dụng</p>
                    <p className="app-modal-section-description">Chọn một hoặc nhiều khối. Hệ thống sẽ lưu dữ liệu dạng chuỗi để đồng bộ với Google Sheet như phiên bản hiện tại.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {gradeOptions.map((grade) => {
                      const isActive = grades.includes(grade);
                      return (
                        <button
                          key={grade}
                          type="button"
                          onClick={() => handleToggleGrade(grade)}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-amber-50'}`}
                        >
                          Khối {grade}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs font-medium text-slate-500">Đang chọn: {gradeSummary}</p>
                </section>
              </div>
            </div>
            <div className="app-modal-footer">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Hủy</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70">
                {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Lưu cập nhật' : 'Tạo môn học'}
              </button>
            </div>
          </motion.form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
