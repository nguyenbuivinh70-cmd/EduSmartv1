import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Save, User as UserIcon, X, Key, MapPin, Milestone, Lock } from 'lucide-react';
import type { CatalogClass, User } from '../types';
import { DEFAULT_ACTIVE_GRADES, sortGrades } from '../constants';
import { formatManagedGrades } from '../utils/gradeScope';

interface ProfileFormModalProps {
  isOpen: boolean;
  user: User | null;
  classes: CatalogClass[];
  isSubmitting: boolean;
  onClose: () => void;
  availableGrades?: string[];
  onSubmit: (payload: { ho_ten: string; khoi?: string; lop_id?: string; mat_khau?: string }) => void;
}

const fieldClassName = 'block w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 transition-all outline-hidden focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10';

export default function ProfileFormModal({
  isOpen,
  user,
  classes,
  isSubmitting,
  availableGrades,
  onClose,
  onSubmit,
}: ProfileFormModalProps) {
  const [hoTen, setHoTen] = useState('');
  const [khoi, setKhoi] = useState('');
  const [lopId, setLopId] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isStudent = user?.vai_tro === 'student';
  const isTeacher = user?.vai_tro === 'teacher';
  const assignmentLocked = isStudent || isTeacher;
  const gradeOptions = useMemo(() => {
    const fromProps = Array.isArray(availableGrades) ? availableGrades : [];
    const fromClasses = classes.map((item) => String(item.khoi || '').trim().replace(/\.0+$/, '')).filter(Boolean);
    const discovered = sortGrades(fromProps.length ? fromProps : fromClasses);
    return discovered.length ? discovered : DEFAULT_ACTIVE_GRADES;
  }, [availableGrades, classes]);

  useEffect(() => {
    if (isOpen && user) {
      setHoTen(user.ho_ten || '');
      setKhoi(user.khoi || '');
      setLopId(user.lop_id || '');
      setMatKhau('');
      setErrors({});
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!hoTen.trim()) newErrors.hoTen = 'Họ tên không được để trống';
    if (matKhau && matKhau.length < 6) newErrors.matKhau = 'Mật khẩu phải từ 6 ký tự';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      ho_ten: hoTen.trim(),
      ...(assignmentLocked ? {} : { khoi: khoi || undefined, lop_id: lopId || undefined }),
      mat_khau: matKhau || undefined,
    });
  };

  return (
    <AnimatePresence>
      <div className="app-modal-overlay !z-50">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        />
        <div className="app-modal-viewport">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="app-modal-panel mx-auto max-w-2xl"
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-5 text-white sm:px-7 sm:py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white">
                <UserIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Hồ sơ cá nhân</h2>
                
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="contents">
            <div className="app-modal-body app-modal-body-padded app-scrollbar">
              <div className="space-y-5">
                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Thông tin cá nhân</p>
                    <p className="app-modal-section-description">{isStudent ? 'Học sinh có thể cập nhật họ tên và mật khẩu. Khối, lớp học do nhà trường quản lý và chỉ hiển thị để đối chiếu.' : isTeacher ? 'Giáo viên có thể cập nhật họ tên và mật khẩu. Phạm vi khối phụ trách do quản trị viên phân công và không thể tự thay đổi.' : 'Các thông tin này sẽ hiển thị trên hồ sơ cá nhân.'}</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Họ tên công dân</label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={hoTen}
                        onChange={(e) => setHoTen(e.target.value)}
                        className={`${fieldClassName} ${errors.hoTen ? 'border-red-300 ring-4 ring-red-50' : ''}`}
                        placeholder="Nhập họ tên đầy đủ..."
                      />
                    </div>
                    {errors.hoTen && <p className="mt-2 text-xs font-medium text-red-500">{errors.hoTen}</p>}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Khối</label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                          <Milestone className="h-4 w-4" />
                        </div>
                        {assignmentLocked ? (
                          <div className="flex min-h-[50px] items-center rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-10 font-semibold text-slate-700">
                            {isTeacher ? formatManagedGrades(user) : `Khối ${user.khoi || '-'}`}
                          </div>
                        ) : (
                          <select
                            value={khoi}
                            onChange={(e) => setKhoi(e.target.value)}
                            className={`${fieldClassName} appearance-none`}
                          >
                            <option value="">Chọn khối...</option>
                            {gradeOptions.map((k) => (
                              <option key={k} value={k}>Khối {k}</option>
                            ))}
                          </select>
                        )}
                        {assignmentLocked ? <Lock className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /> : null}
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Lớp học</label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                          <MapPin className="h-4 w-4" />
                        </div>
                        {assignmentLocked ? (
                          <div className="flex min-h-[50px] items-center rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-10 font-semibold text-slate-700">
                            {isTeacher ? 'Không áp dụng' : (classes.find((c) => c.lop_id === user.lop_id)?.ten_lop || user.lop_id || '-')}
                          </div>
                        ) : (
                          <select
                            value={lopId}
                            onChange={(e) => setLopId(e.target.value)}
                            className={`${fieldClassName} appearance-none`}
                          >
                            <option value="">Chọn lớp...</option>
                            {classes.filter(c => !khoi || c.khoi === khoi).map((c) => (
                              <option key={c.lop_id} value={c.lop_id}>{c.ten_lop}</option>
                            ))}
                          </select>
                        )}
                        {assignmentLocked ? <Lock className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /> : null}
                      </div>
                    </div>
                  </div>
                  {isStudent ? (
                    <div className="mt-3 flex items-start gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-3 text-xs leading-5 text-indigo-700">
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Khối và lớp học do nhà trường quản lý. Học sinh không thể tự thay đổi hai thông tin này.</span>
                    </div>
                  ) : null}
                </section>

                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Bảo mật tài khoản</p>
                    <p className="app-modal-section-description">Bạn có thể đổi mật khẩu ngay tại đây. Nếu để trống, hệ thống sẽ giữ nguyên mật khẩu hiện tại.</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Mật khẩu mới <span className="font-normal text-slate-400">(Để trống nếu không đổi)</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                        <Key className="h-4 w-4" />
                      </div>
                      <input
                        type="password"
                        value={matKhau}
                        onChange={(e) => setMatKhau(e.target.value)}
                        className={`${fieldClassName} ${errors.matKhau ? 'border-red-300 ring-4 ring-red-50' : ''}`}
                        placeholder="Nhập mật khẩu mới..."
                      />
                    </div>
                    {errors.matKhau && <p className="mt-2 text-xs font-medium text-red-500">{errors.matKhau}</p>}
                  </div>
                </section>
              </div>
            </div>

            <div className="app-modal-footer">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-xl shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    <span>Đang cập nhật...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Lưu thay đổi</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
