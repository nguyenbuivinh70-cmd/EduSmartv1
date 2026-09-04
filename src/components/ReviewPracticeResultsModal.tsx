import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, CheckCircle2, Clock, Download, RefreshCw, Users, X, XCircle } from 'lucide-react';
import type { ReviewPracticeAttempt, ReviewPracticeResultStudent, ReviewPracticeResultSummary, ReviewPracticeRow } from '../types';

interface Props {
  isOpen: boolean;
  review: ReviewPracticeRow | null;
  students: ReviewPracticeResultStudent[];
  attempts: ReviewPracticeAttempt[];
  summary?: ReviewPracticeResultSummary | null;
  isLoading?: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatScore(value: unknown) {
  if (value === '' || value === undefined || value === null) return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toFixed(num % 1 === 0 ? 0 : 1);
}

function formatSeconds(value: unknown) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (!total) return '-';
  return `${minutes}p ${String(seconds).padStart(2, '0')}s`;
}

function csvEscape(value: unknown) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

export default function ReviewPracticeResultsModal({ isOpen, review, students, attempts, summary, isLoading = false, onClose, onRefresh }: Props) {
  const completedRate = summary?.total_students ? Math.round((asNumber(summary.completed_students) / asNumber(summary.total_students, 1)) * 100) : 0;
  const sortedStudents = [...students].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
    return String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi') || String(a.ho_ten || '').localeCompare(String(b.ho_ten || ''), 'vi');
  });
  const latestAttempts = [...attempts].sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || ''))).slice(0, 8);

  const exportCsv = () => {
    const rows = [
      ['Học sinh', 'Lớp', 'Trạng thái', 'Số lần làm', 'Điểm cao nhất', 'Điểm gần nhất', 'Điểm trung bình', 'Đúng/Tổng', 'Lần nộp gần nhất', 'Tự nộp khi hết giờ'],
      ...sortedStudents.map((item) => [
        item.ho_ten,
        item.ten_lop || item.lop_id || '',
        item.status === 'completed' ? 'Đã làm' : 'Chưa làm',
        item.attempt_count,
        item.best_score ?? '',
        item.latest_score ?? '',
        item.average_score ?? '',
        item.best_total ? `${item.best_correct || 0}/${item.best_total}` : '',
        item.last_submitted_at || '',
        item.auto_submitted_count || 0,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ket_qua_on_tap_${review?.review_id || 'review'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && review ? (
        <div className="fixed inset-0 z-[12500] bg-slate-950/60 p-3 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
            <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 px-6 py-4 text-white">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em]"><BarChart3 className="h-4 w-4" /> Báo cáo bài ôn tập</p>
                <h2 className="mt-2 truncate text-2xl font-black">{review.tieu_de}</h2>
                <p className="mt-1 text-sm text-white/85">{review.nam_hoc || '-'} • {review.hoc_ky || 'HK1'} • Khối {review.khoi || '-'} • {Number(review.so_cau || 0)} câu</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={onRefresh} disabled={isLoading} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold hover:bg-white/25 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Làm mới</button>
                <button type="button" onClick={exportCsv} disabled={!sortedStudents.length} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-emerald-700 disabled:opacity-60"><Download className="h-4 w-4" /> Xuất CSV</button>
                <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Tỉ lệ hoàn thành</p><p className="mt-2 text-3xl font-black text-emerald-600">{completedRate}%</p><p className="text-sm font-bold text-slate-500">{summary?.completed_students || 0}/{summary?.total_students || 0} học sinh</p></div>
                <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Chưa làm</p><p className="mt-2 text-3xl font-black text-rose-500">{summary?.not_started_students || 0}</p><p className="text-sm font-bold text-slate-500">Cần nhắc hoàn thành</p></div>
                <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Điểm TB cao nhất</p><p className="mt-2 text-3xl font-black text-indigo-600">{formatScore(summary?.average_best_score)}/10</p><p className="text-sm font-bold text-slate-500">Tính theo điểm tốt nhất</p></div>
                <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Điểm cao nhất</p><p className="mt-2 text-3xl font-black text-amber-600">{formatScore(summary?.highest_score)}/10</p><p className="text-sm font-bold text-slate-500">Trong tất cả lượt làm</p></div>
                <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Tổng lượt làm</p><p className="mt-2 text-3xl font-black text-slate-900">{summary?.total_attempts || attempts.length}</p><p className="text-sm font-bold text-slate-500">Bao gồm làm lại</p></div>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Danh sách học sinh</h3>
                      <p className="text-sm text-slate-500">Theo dõi đã làm/chưa làm, điểm tốt nhất và số lần làm.</p>
                    </div>
                    <Users className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Học sinh</th>
                          <th className="px-4 py-3">Lớp</th>
                          <th className="px-4 py-3">Trạng thái</th>
                          <th className="px-4 py-3 text-center">Lần</th>
                          <th className="px-4 py-3 text-center">Cao nhất</th>
                          <th className="px-4 py-3 text-center">TB</th>
                          <th className="px-4 py-3">Nộp gần nhất</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {isLoading ? (
                          <tr><td colSpan={7} className="px-4 py-10 text-center font-semibold text-slate-500">Đang tải kết quả...</td></tr>
                        ) : sortedStudents.length ? sortedStudents.map((item) => (
                          <tr key={item.user_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-bold text-slate-900">{item.ho_ten}</td>
                            <td className="px-4 py-3 text-slate-600">{item.ten_lop || item.lop_id || '-'}</td>
                            <td className="px-4 py-3">{item.status === 'completed' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Đã làm</span> : <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700"><XCircle className="h-3.5 w-3.5" /> Chưa làm</span>}</td>
                            <td className="px-4 py-3 text-center font-black text-slate-700">{item.attempt_count || 0}</td>
                            <td className="px-4 py-3 text-center font-black text-indigo-700">{formatScore(item.best_score)}</td>
                            <td className="px-4 py-3 text-center font-semibold text-slate-700">{formatScore(item.average_score)}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{item.last_submitted_at || '-'}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={7} className="px-4 py-10 text-center font-semibold text-slate-500">Chưa có học sinh phù hợp hoặc chưa có kết quả.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Lượt nộp gần đây</h3>
                      <p className="text-sm text-slate-500">Các lượt làm mới nhất.</p>
                    </div>
                    <Clock className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {latestAttempts.length ? latestAttempts.map((attempt) => {
                      const student = students.find((item) => item.user_id === attempt.user_id);
                      return (
                        <div key={attempt.attempt_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-slate-900">{student?.ho_ten || attempt.user_id}</p>
                              <p className="text-xs font-semibold text-slate-500">{student?.ten_lop || attempt.lop_id || '-'} • {attempt.submitted_at || '-'}</p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-indigo-700 ring-1 ring-indigo-100">{formatScore(attempt.diem)}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                            <span>Đúng {attempt.so_cau_dung || 0}/{attempt.tong_so_cau || 0}</span>
                            <span>•</span>
                            <span>{formatSeconds(attempt.time_spent_seconds)}</span>
                            {attempt.auto_submitted ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Tự nộp</span> : null}
                          </div>
                        </div>
                      );
                    }) : <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">Chưa có lượt nộp.</p>}
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
