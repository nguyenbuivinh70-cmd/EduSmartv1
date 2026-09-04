import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Lock, Search, ShieldCheck, UserRoundCheck, Users, X } from 'lucide-react';
import { Account, CoLearningSession, Lesson } from '../types';

interface CoLearningModalProps {
  isOpen: boolean;
  lesson: Lesson | null;
  classmates: Account[];
  selectedUserIds: string[];
  passwords: Record<string, string>;
  reusableSession: CoLearningSession | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error?: string;
  onToggleClassmate: (userId: string) => void;
  onPasswordChange: (userId: string, password: string) => void;
  onStudyAlone: () => void;
  onResumeCoLearning: () => void;
  onStartCoLearning: () => void;
  onClose: () => void;
}

function normalizeSearch(value: unknown) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function getSessionNames(session: CoLearningSession) {
  if (Array.isArray(session.participant_names) && session.participant_names.length) {
    return session.participant_names.filter(Boolean).slice(0, 6);
  }
  return [session.host_user_id, session.partner_name || session.partner_user_id].filter(Boolean) as string[];
}

export default function CoLearningModal({
  isOpen,
  lesson,
  classmates,
  selectedUserIds,
  passwords,
  reusableSession,
  isLoading,
  isSubmitting,
  error,
  onToggleClassmate,
  onPasswordChange,
  onStudyAlone,
  onResumeCoLearning,
  onStartCoLearning,
  onClose,
}: CoLearningModalProps) {
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);
  const query = normalizeSearch(search);
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const filteredClassmates = useMemo(() => classmates
    .filter((student) => !query
      || normalizeSearch(student.ho_ten).includes(query)
      || normalizeSearch(student.ma_hoc_sinh || student.ten_dang_nhap).includes(query))
    .sort((a, b) => String(a.ho_ten || '').localeCompare(String(b.ho_ten || ''), 'vi')),
  [classmates, query]);
  const selectedClassmates = selectedUserIds
    .map((userId) => classmates.find((student) => student.user_id === userId))
    .filter((student): student is Account => Boolean(student));
  const allPasswordsReady = selectedClassmates.length > 0
    && selectedClassmates.every((student) => String(passwords[student.user_id] || '').trim());

  if (!isOpen || !lesson) return null;
  const reusableNames = reusableSession ? getSessionNames(reusableSession) : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:px-4 sm:py-4">
      <div className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[30px] bg-white shadow-2xl ring-1 ring-slate-200 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[32px]">
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-5 text-white sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide"><Users className="h-4 w-4" /> Học cùng nhóm</p>
              <h2 className="mt-3 text-xl font-black sm:text-2xl">Chọn cách học “{lesson.tieu_de}”</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-white/85">Chọn tối đa 5 bạn cùng lớp. Sau lần xác nhận đầu, nhóm được ghi nhớ riêng cho bài học này.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl bg-white/10 p-2 hover:bg-white/20" aria-label="Đóng"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/70 px-4 py-5 sm:px-7">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

          {reusableSession && reusableNames.length > 1 && (
            <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-black text-emerald-900"><UserRoundCheck className="h-5 w-5" /> Nhóm học gần nhất đã được xác nhận</p>
                  <div className="mt-3 flex flex-wrap gap-2">{reusableNames.map((name, index) => <span key={`${name}-${index}`} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">{name}</span>)}</div>
                  <p className="mt-3 text-xs leading-5 text-emerald-700">Không cần nhập lại mật khẩu. Hệ thống sẽ kiểm tra trạng thái tài khoản khi tiếp tục.</p>
                </div>
                <button type="button" onClick={onResumeCoLearning} disabled={isSubmitting} className="shrink-0 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:bg-slate-300">Tiếp tục nhóm cũ</button>
              </div>
            </section>
          )}

          <button type="button" onClick={onStudyAlone} className="flex w-full items-center justify-between rounded-[22px] border border-indigo-100 bg-white px-5 py-4 text-left shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50">
            <span><span className="flex items-center gap-2 font-black text-indigo-800"><BookOpen className="h-5 w-5" /> Học một mình</span><span className="mt-1 block text-sm text-slate-500">Mở bài ngay và chỉ lưu tiến độ cho tài khoản của em.</span></span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">Bắt đầu</span>
          </button>

          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-black text-slate-900">Tạo nhóm học mới</h3><p className="mt-1 text-sm text-slate-500">Hiển thị toàn bộ học sinh đang hoạt động trong lớp. Chọn theo tên; mã học sinh dùng để phân biệt khi trùng tên.</p></div>
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{classmates.length} bạn cùng lớp</span><span className={`rounded-full px-3 py-1.5 text-xs font-black ${selectedUserIds.length >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700'}`}>{selectedUserIds.length}/5 đã chọn</span></div>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
              <Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo họ tên hoặc mã học sinh..." className="w-full bg-transparent text-sm outline-none" />
            </label>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {isLoading ? <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">Đang tải danh sách bạn cùng lớp...</div> : filteredClassmates.length ? filteredClassmates.map((student) => {
                const selected = selectedSet.has(student.user_id);
                const disabled = !selected && selectedUserIds.length >= 5;
                return (
                  <button key={student.user_id} type="button" onClick={() => !disabled && onToggleClassmate(student.user_id)} disabled={disabled} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100' : disabled ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-45' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}><Check className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900">{student.ho_ten}</span><span className="mt-0.5 block truncate text-xs text-slate-500">Mã HS {student.ma_hoc_sinh || student.ten_dang_nhap} • Lớp {student.ten_lop_hien_thi || student.ten_lop || student.lop_id || '-'}</span></span>
                  </button>
                );
              }) : <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Không tìm thấy học sinh cùng lớp phù hợp.</div>}
            </div>

            {selectedClassmates.length > 0 && (
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-start gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p><b>Xác nhận một lần:</b> mỗi bạn nhập mật khẩu hiện tại. Hệ thống không lưu mật khẩu và lần sau có thể tiếp tục nhóm mà không nhập lại.</p></div>
                {selectedClassmates.map((student) => (
                  <label key={student.user_id} className="block rounded-2xl border border-slate-200 p-4">
                    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span className="truncate">{student.ho_ten}</span><span className="shrink-0 text-xs font-medium text-slate-400">{student.ma_hoc_sinh || student.ten_dang_nhap}</span></span>
                    <span className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-200"><Lock className="h-4 w-4 text-slate-400" /><input type="password" value={passwords[student.user_id] || ''} onChange={(event) => onPasswordChange(student.user_id, event.target.value)} autoComplete="current-password" placeholder="Nhập mật khẩu hiện tại" className="w-full bg-transparent text-sm outline-none" /></span>
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-7">
          <p className="text-xs text-slate-500">Nhóm mới gồm <b>{selectedUserIds.length + 1}</b> học sinh tính cả em.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="button" onClick={onStartCoLearning} disabled={!selectedUserIds.length || !allPasswordsReady || isSubmitting} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{isSubmitting ? 'Đang xác nhận...' : `Tạo nhóm ${selectedUserIds.length + 1} học sinh`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
