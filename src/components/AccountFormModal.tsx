import { AnimatePresence, motion } from 'motion/react';
import { Check, GraduationCap, Layers3, LoaderCircle, ShieldCheck, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Account, CatalogClass, Role } from '../types';
import { DEFAULT_ACTIVE_GRADES, sortGrades } from '../constants';

interface AccountFormValues {
  user_id?: string;
  ho_ten: string;
  ten_dang_nhap: string;
  mat_khau: string;
  current_password?: string;
  vai_tro: Role;
  lop_id: string;
  khoi: string;
  khoi_phu_trach: string[];
  tat_ca_khoi: boolean;
  trang_thai: string;
  ghi_chu: string;
  ma_hoc_sinh: string;
  ngay_sinh: string;
  gioi_tinh: string;
  tai_khoan_dinh_danh: string;
  mat_khau_khoi_tao: string;
  so_dien_thoai: string;
  nguon_du_lieu: string;
  quyen_admin: boolean;
}

interface AccountFormModalProps {
  isOpen: boolean;
  classes: CatalogClass[];
  availableGrades?: string[];
  initialData?: Account | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: any) => Promise<void> | void;
}

const INITIAL_VALUES: AccountFormValues = {
  ho_ten: '',
  ten_dang_nhap: '',
  mat_khau: '',
  vai_tro: 'student',
  lop_id: '',
  khoi: '',
  khoi_phu_trach: [],
  tat_ca_khoi: false,
  trang_thai: 'active',
  ghi_chu: '',
  ma_hoc_sinh: '',
  ngay_sinh: '',
  gioi_tinh: '',
  tai_khoan_dinh_danh: '',
  mat_khau_khoi_tao: '',
  so_dien_thoai: '',
  nguon_du_lieu: '',
  quyen_admin: false,
};

const fieldClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

function normalizeBooleanFlag(value: unknown) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on', 'co', 'có'].includes(normalized);
}

export default function AccountFormModal({ isOpen, classes, availableGrades = DEFAULT_ACTIVE_GRADES, initialData, isSubmitting = false, onClose, onSubmit }: AccountFormModalProps) {
  const gradeOptions = useMemo(() => sortGrades(availableGrades.length ? availableGrades : DEFAULT_ACTIVE_GRADES), [availableGrades]);
  const [values, setValues] = useState<AccountFormValues>(INITIAL_VALUES);
  const [assignmentError, setAssignmentError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setValues({
        user_id: initialData.user_id,
        ho_ten: initialData.ho_ten || '',
        ten_dang_nhap: initialData.ten_dang_nhap || '',
        mat_khau: '',
        vai_tro: initialData.vai_tro || 'student',
        lop_id: initialData.lop_id || '',
        khoi: initialData.khoi || '',
        khoi_phu_trach: Array.isArray(initialData.khoi_phu_trach) && initialData.khoi_phu_trach.length ? initialData.khoi_phu_trach : (initialData.khoi ? [initialData.khoi] : []),
        tat_ca_khoi: initialData.tat_ca_khoi === true,
        trang_thai: initialData.trang_thai || 'active',
        ghi_chu: initialData.ghi_chu || '',
        ma_hoc_sinh: initialData.ma_hoc_sinh || '',
        ngay_sinh: initialData.ngay_sinh || '',
        gioi_tinh: initialData.gioi_tinh || '',
        tai_khoan_dinh_danh: initialData.tai_khoan_dinh_danh || '',
        mat_khau_khoi_tao: '',
        so_dien_thoai: initialData.so_dien_thoai || '',
        nguon_du_lieu: initialData.nguon_du_lieu || '',
        quyen_admin: normalizeBooleanFlag(initialData.quyen_admin),
      });
      return;
    }
    setValues(INITIAL_VALUES);
    setAssignmentError('');
  }, [isOpen, initialData]);

  const filteredClasses = useMemo(() => classes.filter((item) => !values.khoi || String(item.khoi || '') === String(values.khoi || '')), [classes, values.khoi]);
  const shouldSelectGrade = values.vai_tro === 'student';
  const shouldSelectClass = values.vai_tro === 'student';
  const isStudent = values.vai_tro === 'student';
  const isTeacher = values.vai_tro === 'teacher';
  const canGrantAdminPermission = values.vai_tro === 'teacher';
  const teacherManagedGrades = values.tat_ca_khoi ? gradeOptions : sortGrades(values.khoi_phu_trach);

  useEffect(() => {
    if (values.vai_tro === 'admin') {
      if (values.lop_id || values.khoi || values.khoi_phu_trach.length || values.tat_ca_khoi) {
        setValues((current) => ({ ...current, lop_id: '', khoi: '', khoi_phu_trach: [], tat_ca_khoi: false }));
      }
      setAssignmentError('');
      return;
    }

    if (values.vai_tro === 'teacher') {
      if (values.lop_id || values.khoi) {
        setValues((current) => ({ ...current, lop_id: '', khoi: '' }));
      }
      return;
    }

    if (values.khoi && values.lop_id) {
      const match = filteredClasses.find((item) => String(item.lop_id || '') === String(values.lop_id || ''));
      if (!match) {
        setValues((current) => ({ ...current, lop_id: '' }));
      }
    }
  }, [values.vai_tro, values.khoi, values.lop_id, values.khoi_phu_trach.length, values.tat_ca_khoi, filteredClasses]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isTeacher && !values.tat_ca_khoi && teacherManagedGrades.length === 0) {
      setAssignmentError('Hãy chọn ít nhất một khối phụ trách hoặc chọn “Tất cả các khối”.');
      return;
    }
    setAssignmentError('');
    const studentCode = values.ma_hoc_sinh.trim();
    const primaryTeacherGrade = teacherManagedGrades[0] || '';
    const payload: AccountFormValues = {
      ...values,
      ten_dang_nhap: values.vai_tro === 'student' ? studentCode : values.ten_dang_nhap,
      mat_khau: values.vai_tro === 'student' && !initialData?.user_id ? studentCode : values.mat_khau,
      mat_khau_khoi_tao: values.vai_tro === 'student' && !initialData?.user_id ? studentCode : values.mat_khau_khoi_tao,
      khoi: isStudent ? values.khoi : isTeacher ? primaryTeacherGrade : '',
      khoi_phu_trach: isTeacher ? teacherManagedGrades : [],
      tat_ca_khoi: isTeacher ? values.tat_ca_khoi : false,
      lop_id: shouldSelectClass ? values.lop_id : '',
      quyen_admin: canGrantAdminPermission ? values.quyen_admin : false,
    };
    await onSubmit(payload);
  };

  const isEdit = Boolean(initialData?.user_id);

  useEffect(() => {
    if (values.vai_tro !== 'student') return;
    const studentCode = values.ma_hoc_sinh.trim();
    setValues((current) => {
      const nextUsername = studentCode;
      const nextPassword = isEdit ? current.mat_khau : studentCode;
      const nextInitialPassword = isEdit ? current.mat_khau_khoi_tao : studentCode;
      if (
        current.ten_dang_nhap === nextUsername
        && current.mat_khau === nextPassword
        && current.mat_khau_khoi_tao === nextInitialPassword
      ) return current;
      return {
        ...current,
        ten_dang_nhap: nextUsername,
        mat_khau: nextPassword,
        mat_khau_khoi_tao: nextInitialPassword,
      };
    });
  }, [isEdit, values.ma_hoc_sinh, values.vai_tro]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="app-modal-overlay">
          <div className="app-modal-viewport">
          <motion.form
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            onSubmit={handleSubmit}
            className="app-modal-panel mx-auto max-w-4xl"
          >
            <div className="flex items-start justify-between bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-5 text-white sm:px-7 sm:py-6">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  {values.vai_tro === 'admin' ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  {isEdit ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}
                </p>
                <h3 className="mt-3 text-2xl font-bold">{isEdit ? 'Chỉnh sửa tài khoản hệ thống' : 'Thêm tài khoản mới vào hệ thống'}</h3>
                
              </div>
              <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 transition hover:bg-white/25">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="app-modal-body app-modal-body-padded app-scrollbar">
              <div className="space-y-5">
                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Thông tin đăng nhập</p>
                    <p className="app-modal-section-description">Điền họ tên, tài khoản và trạng thái hoạt động của người dùng.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Họ và tên</span>
                      <input value={values.ho_ten} onChange={(e) => setValues((c) => ({ ...c, ho_ten: e.target.value }))} required className={fieldClassName} placeholder="Ví dụ: Nguyễn Văn An" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Tên đăng nhập</span>
                      <input value={values.ten_dang_nhap} onChange={(e) => setValues((c) => ({ ...c, ten_dang_nhap: e.target.value }))} required disabled={isStudent || isEdit} className={fieldClassName} placeholder={isStudent ? 'Tự động lấy theo mã học sinh' : 'Ví dụ: giaovien01'} />
                      {isStudent && <span className="block text-xs text-indigo-600">Tên đăng nhập được đồng bộ với mã học sinh và giữ cố định sau khi tạo.</span>}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">{isEdit ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu'}</span>
                      <input type="password" minLength={6} value={values.mat_khau} onChange={(e) => setValues((c) => ({ ...c, mat_khau: e.target.value }))} required={!isEdit} disabled={isStudent && !isEdit} className={fieldClassName} placeholder={isEdit ? 'Nhập khi cần đổi mật khẩu' : isStudent ? 'Tự động lấy theo mã học sinh' : 'Tối thiểu 6 ký tự'} />
                      {isStudent && <span className="block text-xs text-indigo-600">Mật khẩu ban đầu/reset mặc định là mã học sinh.</span>}
                    </label>

                    {isEdit && values.mat_khau && <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Mật khẩu hiện tại của tài khoản đang sửa</span>
                      <input type="password" autoComplete="off" value={values.current_password || ''}
                        onChange={event => setValues(current => ({ ...current, current_password: event.target.value }))}
                        className={fieldClassName} placeholder="Dùng để xác thực lần đổi mật khẩu này" />
                      <span className="block text-xs text-slate-600">Không biết mật khẩu hiện tại thì không thể ép đổi mật khẩu Firebase trong mô hình này.</span>
                    </label>}

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">Vai trò</span>
                      <select value={values.vai_tro} onChange={(e) => setValues((c) => ({ ...c, vai_tro: e.target.value as Role }))} className={fieldClassName}>
                        <option value="student">Học sinh</option>
                        <option value="teacher">Giáo viên</option>
                        <option value="admin">Admin</option>
                      </select>
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

                {values.vai_tro === 'teacher' && (
                  <section className="app-modal-section border-violet-100 bg-violet-50/40">
                    <div className="mb-4 flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="app-modal-section-title">Phân quyền admin cho giáo viên</p>
                        <p className="app-modal-section-description">Khi bật, giáo viên được sử dụng các chức năng quản trị như tài khoản, lớp học, môn học, duyệt chia sẻ, cấu hình video và theo dõi toàn hệ thống.</p>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm shadow-sm">
                      <input
                        type="checkbox"
                        checked={values.quyen_admin}
                        onChange={(e) => setValues((c) => ({ ...c, quyen_admin: e.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span>
                        <span className="block font-semibold text-slate-800">Cấp quyền admin cho giáo viên này</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">Tài khoản vẫn là vai trò Giáo viên, nhưng được mở thêm menu và quyền thao tác như quản trị viên.</span>
                      </span>
                    </label>
                  </section>
                )}

                {(isStudent || isTeacher) && (
                  <section className="app-modal-section">
                    <div className="mb-4 flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                        {isTeacher ? <Layers3 className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="app-modal-section-title">{isTeacher ? 'Phân công khối lớp phụ trách' : 'Phân quyền theo khối và lớp'}</p>
                        <p className="app-modal-section-description">
                          {isTeacher
                            ? 'Giáo viên có thể được phân công một khối, nhiều khối hoặc toàn bộ các khối. Phạm vi này được dùng để giới hạn học sinh, bài học, kết quả và dữ liệu giáo viên được phép quản lý.'
                            : 'Học sinh bắt buộc gắn với đúng một khối và một lớp học.'}
                        </p>
                      </div>
                    </div>

                    {isTeacher ? (
                      <div className="space-y-4">
                        <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 transition ${values.tat_ca_khoi ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
                          <input
                            type="checkbox"
                            checked={values.tat_ca_khoi}
                            onChange={(e) => {
                              setAssignmentError('');
                              setValues((current) => ({ ...current, tat_ca_khoi: e.target.checked }));
                            }}
                            className="mt-1 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 text-sm font-black text-slate-800">
                              Tất cả các khối
                              {values.tat_ca_khoi ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white"><Check className="h-3.5 w-3.5" /></span> : null}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">Giáo viên được quản lý dữ liệu của toàn bộ khối đang hoạt động trong trường.</span>
                          </span>
                        </label>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-700">Chọn các khối phụ trách</span>
                            <span className="text-xs font-bold text-indigo-600">
                              {values.tat_ca_khoi ? 'Tất cả khối' : teacherManagedGrades.length ? `${teacherManagedGrades.length} khối đã chọn` : 'Chưa chọn khối'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {gradeOptions.map((grade) => {
                              const checked = values.tat_ca_khoi || values.khoi_phu_trach.includes(grade);
                              return (
                                <label key={grade} className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-black transition ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'} ${values.tat_ca_khoi ? 'cursor-default opacity-80' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={values.tat_ca_khoi}
                                    onChange={(e) => {
                                      setAssignmentError('');
                                      setValues((current) => ({
                                        ...current,
                                        khoi_phu_trach: e.target.checked
                                          ? sortGrades([...current.khoi_phu_trach, grade])
                                          : current.khoi_phu_trach.filter((item) => item !== grade),
                                      }));
                                    }}
                                    className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  Khối {grade}
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className={`rounded-2xl px-4 py-3 text-xs font-semibold ${assignmentError ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-100'}`}>
                          {assignmentError || (values.tat_ca_khoi
                            ? 'Phạm vi hiện tại: Tất cả các khối.'
                            : teacherManagedGrades.length
                              ? `Phạm vi hiện tại: ${teacherManagedGrades.map((grade) => `Khối ${grade}`).join(' • ')}.`
                              : 'Chọn ít nhất một khối để giới hạn đúng phạm vi dữ liệu của giáo viên.')}
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-slate-700">Khối học</span>
                          <select value={values.khoi} onChange={(e) => setValues((c) => ({ ...c, khoi: e.target.value }))} required={shouldSelectGrade} className={fieldClassName}>
                            <option value="">Chọn khối</option>
                            {gradeOptions.map((grade) => (
                              <option key={grade} value={grade}>Khối {grade}</option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-slate-700">Lớp học</span>
                          <select value={values.lop_id} onChange={(e) => setValues((c) => ({ ...c, lop_id: e.target.value }))} required={shouldSelectClass} disabled={!values.khoi} className={fieldClassName}>
                            <option value="">{filteredClasses.length ? 'Chọn lớp' : 'Không có lớp phù hợp'}</option>
                            {filteredClasses.map((item) => (
                              <option key={item.lop_id} value={item.lop_id}>{item.ten_lop} • {item.lop_id}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </section>
                )}

                {isStudent && (
                  <section className="app-modal-section">
                    <div className="mb-4">
                      <p className="app-modal-section-title">Thông tin học sinh mở rộng</p>
                      <p className="app-modal-section-description">Các trường này hữu ích khi đồng bộ dữ liệu từ vnEdu hoặc cần theo dõi hồ sơ học sinh chi tiết hơn.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-slate-700">Mã học sinh vnEdu</span>
                        <input disabled={isEdit} value={values.ma_hoc_sinh} onChange={(e) => setValues((c) => ({ ...c, ma_hoc_sinh: e.target.value.replace(/\D/g, '') }))} required inputMode="numeric" pattern="[0-9]{6,}" minLength={6} className={fieldClassName} placeholder="Ví dụ: 2100175651" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-slate-700">Ngày sinh</span>
                        <input value={values.ngay_sinh} onChange={(e) => setValues((c) => ({ ...c, ngay_sinh: e.target.value }))} className={fieldClassName} placeholder="dd/mm/yyyy nếu có" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-slate-700">Giới tính</span>
                        <select value={values.gioi_tinh} onChange={(e) => setValues((c) => ({ ...c, gioi_tinh: e.target.value }))} required className={fieldClassName}>
                          <option value="">Chọn giới tính</option>
                          <option value="Nam">Nam</option>
                          <option value="Nữ">Nữ</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-slate-700">TK theo mã định danh</span>
                        <input value={values.tai_khoan_dinh_danh} onChange={(e) => setValues((c) => ({ ...c, tai_khoan_dinh_danh: e.target.value }))} className={fieldClassName} placeholder="Tài khoản định danh từ vnEdu" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-slate-700">Số điện thoại SLL</span>
                        <input value={values.so_dien_thoai} onChange={(e) => setValues((c) => ({ ...c, so_dien_thoai: e.target.value }))} className={fieldClassName} placeholder="Số điện thoại phụ huynh/liên lạc" />
                      </label>
                    </div>
                  </section>
                )}

                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Ghi chú</p>
                    <p className="app-modal-section-description">Lưu thêm thông tin nội bộ dành cho quản trị viên nếu cần.</p>
                  </div>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Nội dung ghi chú</span>
                    <textarea value={values.ghi_chu} onChange={(e) => setValues((c) => ({ ...c, ghi_chu: e.target.value }))} rows={4} className={fieldClassName} placeholder="Thông tin thêm cho quản trị hệ thống" />
                  </label>
                </section>
              </div>
            </div>

            <div className="app-modal-footer">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Hủy</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70">
                {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Lưu cập nhật' : 'Tạo tài khoản'}
              </button>
            </div>
          </motion.form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
