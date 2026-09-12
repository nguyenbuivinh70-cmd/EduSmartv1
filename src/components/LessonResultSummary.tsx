import { AlertTriangle, Award, BookOpenCheck, CheckCircle2, Clock3, RotateCcw, XCircle } from 'lucide-react';

export default function LessonResultSummary({
  score,
  scoreStatus = 'in_progress',
  passScore,
  finalCorrect,
  finalTotal,
  finalExamSubmitted = false,
  completedSections = 0,
  totalSections = 0,
  incompleteSections = [],
  finalExamScore,
  preparationStatus = 'not_started',
  preparationWatchPercent = 0,
  onReviewIncomplete,
  onRetry,
}: {
  score: number;
  scoreStatus?: 'in_progress' | 'finalized' | 'not_applicable';
  passScore: number;
  finalCorrect: number;
  finalTotal: number;
  finalExamSubmitted?: boolean;
  completedSections?: number;
  totalSections?: number;
  incompleteSections?: string[];
  finalExamScore?: number;
  preparationStatus?: string;
  preparationWatchPercent?: number;
  onReviewIncomplete?: () => void;
  onRetry?: () => void;
}) {
  const safeScore = Number.isFinite(score) ? score : 0;
  const safeFinalExamScore = Number.isFinite(Number(finalExamScore)) ? Number(finalExamScore) : undefined;
  const preparationLabel = preparationStatus === 'prepared'
    ? 'Đã chuẩn bị bài'
    : preparationStatus === 'late_completed'
      ? 'Hoàn thành muộn'
      : preparationStatus === 'in_progress'
        ? 'Đang chuẩn bị'
        : 'Chưa chuẩn bị';
  const hasIncompleteSections = incompleteSections.length > 0;
  const finalized = scoreStatus === 'finalized';
  const noScore = scoreStatus === 'not_applicable' || finalTotal === 0;
  const passed = finalized && safeScore >= passScore;
  const statusLabel = noScore
    ? 'Bài học không có kiểm tra cuối bài'
    : finalized
      ? passed ? 'Hoàn thành bài học' : 'Cần ôn tập thêm'
      : hasIncompleteSections ? 'Chưa đủ điều kiện kiểm tra' : 'Chưa nộp kiểm tra cuối bài';
  const headlineTone = noScore ? 'text-slate-700' : finalized ? (passed ? 'text-emerald-600' : 'text-rose-600') : 'text-amber-600';
  const iconTone = noScore ? 'bg-slate-100 text-slate-600' : finalized ? (passed ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600') : 'bg-amber-50 text-amber-600';

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-col items-center text-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-[28px] ${iconTone}`}>
          {noScore ? <BookOpenCheck className="h-10 w-10" /> : finalized ? (passed ? <Award className="h-10 w-10" /> : <XCircle className="h-10 w-10" />) : <Clock3 className="h-10 w-10" />}
        </div>
        <h3 className="mt-4 text-2xl font-black text-slate-900">{statusLabel}</h3>
        {noScore ? (
          <p className="mt-2 text-xl font-black text-slate-500">Không áp dụng điểm số</p>
        ) : finalized ? (
          <p className={`mt-2 text-3xl font-black ${headlineTone}`}>{safeScore.toFixed(1)}/10</p>
        ) : (
          <p className={`mt-2 text-2xl font-black ${headlineTone}`}>Chưa có điểm chính thức</p>
        )}
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          <b>Điểm duy nhất của bài học là điểm kiểm tra cuối bài.</b> Video chuẩn bị và các mục học tập chỉ ghi nhận trạng thái/tiến độ, không tạo điểm. Mức đạt ≥ {passScore}/10.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl px-4 py-3 ${preparationStatus === 'prepared' ? 'bg-emerald-50' : preparationStatus === 'late_completed' ? 'bg-amber-50' : 'bg-fuchsia-50'}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${preparationStatus === 'prepared' ? 'text-emerald-600' : preparationStatus === 'late_completed' ? 'text-amber-600' : 'text-fuchsia-600'}`}>Chuẩn bị bài</p>
          <p className={`mt-2 text-xl font-black ${preparationStatus === 'prepared' ? 'text-emerald-900' : preparationStatus === 'late_completed' ? 'text-amber-900' : 'text-fuchsia-900'}`}>{preparationLabel}</p>
          <p className="mt-1 text-xs text-slate-600">Video {Math.max(0, Math.min(100, Math.round(Number(preparationWatchPercent || 0))))}% • Không tính điểm</p>
        </div>

        <div className="rounded-2xl bg-indigo-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">Tiến độ học tập</p>
          <p className="mt-2 text-xl font-black text-indigo-900">{completedSections}/{totalSections} mục</p>
          <p className="mt-1 text-xs text-indigo-700">{completedSections >= totalSections ? 'Đã hoàn thành tất cả mục' : `Còn ${Math.max(0, totalSections - completedSections)} mục • Không tính điểm`}</p>
        </div>

        <div className="rounded-2xl bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600">Kiểm tra cuối bài</p>
          <p className="mt-2 text-xl font-black text-emerald-900">{finalTotal === 0 ? 'Không áp dụng' : !finalExamSubmitted ? 'Chưa nộp' : safeFinalExamScore === undefined ? 'Chưa có' : `${safeFinalExamScore.toFixed(1)}/10`}</p>
          <p className="mt-1 text-xs text-emerald-700">{finalTotal > 0 ? `${finalCorrect}/${finalTotal} câu đúng • 100% điểm bài` : 'Bài học không có kiểm tra cuối bài'}</p>
        </div>

        <div className={`rounded-2xl px-4 py-3 ${finalized ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${finalized ? 'text-amber-600' : 'text-slate-500'}`}>Điểm chính thức</p>
          <p className={`mt-2 text-xl font-black ${finalized ? 'text-amber-900' : 'text-slate-700'}`}>{finalized ? `${safeScore.toFixed(1)}/10` : 'Chưa có'}</p>
          <p className="mt-1 text-xs text-slate-600">Chỉ chốt khi hoàn thành mọi mục và bấm Nộp bài</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
        <p className="font-bold text-slate-900">Cách tính điểm V6.81</p>
        <p className="mt-1">Các mục học tập không tính điểm. Hệ thống chỉ dùng chúng để xác nhận học sinh đã hoàn thành nội dung. Sau khi hoàn thành toàn bộ mục, học sinh mới được mở kiểm tra cuối bài. Điểm chính thức = số câu đúng / tổng số câu kiểm tra × 10 và chỉ được chốt khi bấm <b>Nộp bài</b>.</p>
      </div>

      {hasIncompleteSections ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-7 text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-bold">Em còn {incompleteSections.length} nội dung chưa hoàn thành.</p>
              <p className="mt-1">Hoàn thành các mục dưới đây để mở kiểm tra cuối bài. Các mục này không tạo điểm:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {incompleteSections.slice(0, 6).map((title) => <li key={title}>{title}</li>)}
              </ul>
              {onReviewIncomplete ? (
                <button type="button" onClick={onReviewIncomplete} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-700">
                  <BookOpenCheck className="h-4 w-4" /> Học tiếp phần còn thiếu
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : !noScore && !finalized ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <Clock3 className="mt-0.5 h-5 w-5" />
          <p>{!finalExamSubmitted ? 'Em đã hoàn thành phần học tập. Hãy làm và nộp kiểm tra cuối bài để nhận điểm chính thức.' : 'Bài kiểm tra đang được đồng bộ kết quả.'}</p>
        </div>
      ) : (
        <div className={`mt-6 flex items-start gap-3 rounded-2xl px-4 py-4 text-sm ${noScore || passed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          <CheckCircle2 className="mt-0.5 h-5 w-5" />
          <p>{noScore ? 'Em đã hoàn thành nội dung học tập. Bài này không có kiểm tra cuối bài nên không có điểm.' : passed ? 'Bạn đã đạt yêu cầu của bài học.' : 'Bạn chưa đạt mức yêu cầu. Hãy xem lại bài và luyện tập thêm.'}</p>
        </div>
      )}

      {finalTotal > 0 ? (
        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm leading-7 text-indigo-900">
          <p className="font-black">Kết quả kiểm tra</p>
          <p className="mt-1">Đúng {finalCorrect}/{finalTotal} câu. Đây là thành phần duy nhất dùng để tính điểm bài học.</p>
        </div>
      ) : null}

      {onRetry ? (
        <div className="mt-5 flex justify-center">
          <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">
            <RotateCcw className="h-4 w-4" /> Làm lại bài
          </button>
        </div>
      ) : null}
    </div>
  );
}
