import { AlertTriangle, Award, BookOpenCheck, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';

export default function LessonResultSummary({
  score,
  passScore,
  correct,
  total,
  interactiveCorrect,
  interactiveTotal,
  finalCorrect,
  finalTotal,
  completedSections = 0,
  totalSections = 0,
  incompleteSections = [],
  learningProcessScore = 0,
  finalExamScore = 0,
  learningWeight = 40,
  finalWeight = 60,
  preparationScore = 0,
  preparationWeight = 0,
  preparationStatus = 'not_started',
  onReviewIncomplete,
  onRetry,
}: {
  score: number;
  passScore: number;
  correct: number;
  total: number;
  interactiveCorrect: number;
  interactiveTotal: number;
  finalCorrect: number;
  finalTotal: number;
  completedSections?: number;
  totalSections?: number;
  incompleteSections?: string[];
  learningProcessScore?: number;
  finalExamScore?: number;
  learningWeight?: number;
  finalWeight?: number;
  preparationScore?: number;
  preparationWeight?: number;
  preparationStatus?: string;
  onReviewIncomplete?: () => void;
  onRetry?: () => void;
}) {
  const safeScore = Number.isFinite(score) ? score : 0;
  const safeLearningProcessScore = Number.isFinite(learningProcessScore) ? learningProcessScore : 0;
  const safeFinalExamScore = Number.isFinite(finalExamScore) ? finalExamScore : 0;
  const safePreparationScore = Number.isFinite(preparationScore) ? preparationScore : 0;
  const preparationLabel = preparationStatus === 'prepared' ? 'Có chuẩn bị bài' : preparationStatus === 'late_completed' ? 'Hoàn thành muộn' : preparationStatus === 'in_progress' ? 'Đang chuẩn bị' : 'Chưa chuẩn bị';
  const hasIncompleteSections = incompleteSections.length > 0;
  const passed = safeScore >= passScore && !hasIncompleteSections;
  const statusLabel = passed ? 'Hoàn thành bài học' : hasIncompleteSections ? 'Chưa đủ điều kiện hoàn thành' : 'Cần ôn tập thêm';

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-col items-center text-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-[28px] ${passed ? 'bg-emerald-50 text-emerald-600' : hasIncompleteSections ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
          {passed ? <Award className="h-10 w-10" /> : hasIncompleteSections ? <AlertTriangle className="h-10 w-10" /> : <XCircle className="h-10 w-10" />}
        </div>
        <h3 className="mt-4 text-2xl font-black text-slate-900">{statusLabel}</h3>
        <p className={`mt-2 text-3xl font-black ${passed ? 'text-emerald-600' : hasIncompleteSections ? 'text-amber-600' : 'text-rose-600'}`}>{safeScore.toFixed(1)}/10</p>
        <p className="mt-1 text-sm text-slate-500">Điểm tổng kết = chuẩn bị bài ({preparationWeight}%) + quá trình học ({learningWeight}%) + kiểm tra cuối bài ({finalWeight}%) • Điểm đạt {passScore}/10</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className={`rounded-2xl px-4 py-3 ${preparationStatus === 'prepared' ? 'bg-emerald-50' : 'bg-fuchsia-50'}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${preparationStatus === 'prepared' ? 'text-emerald-600' : 'text-fuchsia-600'}`}>Chuẩn bị bài</p>
          <p className={`mt-2 text-xl font-black ${preparationStatus === 'prepared' ? 'text-emerald-900' : 'text-fuchsia-900'}`}>{preparationWeight > 0 ? `${safePreparationScore.toFixed(1)}/10` : 'Không tính'}</p>
          <p className={`mt-1 text-xs ${preparationStatus === 'prepared' ? 'text-emerald-700' : 'text-fuchsia-700'}`}>{preparationLabel}{preparationWeight > 0 ? ` • ${preparationWeight}%` : ''}</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">Quá trình học</p>
          <p className="mt-2 text-xl font-black text-indigo-900">{safeLearningProcessScore.toFixed(1)}/10</p>
          <p className="mt-1 text-xs text-indigo-700">Nội dung {completedSections}/{totalSections} • Tương tác {interactiveCorrect}/{interactiveTotal}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600">Kiểm tra cuối bài</p>
          <p className="mt-2 text-xl font-black text-emerald-900">{safeFinalExamScore.toFixed(1)}/10</p>
          <p className="mt-1 text-xs text-emerald-700">Đúng {finalCorrect}/{finalTotal} câu</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Tổng câu đúng</p>
          <p className="mt-2 text-xl font-black text-slate-900">{correct}/{total}</p>
          <p className="mt-1 text-xs text-slate-500">Tương tác + kiểm tra</p>
        </div>
        <div className="rounded-2xl bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-600">Nội dung học</p>
          <p className="mt-2 text-xl font-black text-amber-900">{completedSections}/{totalSections}</p>
          <p className="mt-1 text-xs text-amber-700">Mục có check xanh</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
        <p className="font-bold text-slate-900">Cách hiểu kết quả</p>
        <p className="mt-1">Điểm chuẩn bị bài phản ánh việc hoàn thành video trước hạn; điểm quá trình phản ánh việc học đủ các mục và hoàn thành câu hỏi tương tác; điểm kiểm tra cuối bài phản ánh kết quả sau khi học. Khi học nhóm, phần quá trình và kiểm tra có thể dùng chung cho nhóm nhưng điểm chuẩn bị được áp dụng riêng cho từng học sinh.</p>
      </div>

      {hasIncompleteSections ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-7 text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-bold">Em còn {incompleteSections.length} nội dung chưa hoàn thành.</p>
              <p className="mt-1">Hãy quay lại đọc đủ thời gian và trả lời câu hỏi tương tác ở các mục sau:</p>
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
      ) : (
        <div className={`mt-6 flex items-start gap-3 rounded-2xl px-4 py-4 text-sm ${passed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          <CheckCircle2 className="mt-0.5 h-5 w-5" />
          <p>{passed ? 'Bạn đã đạt yêu cầu của bài học. Có thể xem lại phần giải thích để củng cố kiến thức.' : 'Bạn chưa đạt điểm yêu cầu. Hãy xem lại nội dung học và bài kiểm tra cuối bài để làm lại tốt hơn.'}</p>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm leading-7 text-indigo-900">
        <p className="font-black">Gợi ý học tiếp</p>
        {hasIncompleteSections ? (
          <p className="mt-1">Hãy bấm “Học tiếp phần còn thiếu”, đọc đủ thời gian và hoàn thành câu hỏi tương tác trước khi xem lại kết quả.</p>
        ) : safeFinalExamScore < passScore ? (
          <p className="mt-1">Em đã hoàn thành nội dung học. Hãy xem lại các câu kiểm tra cuối bài bị sai và làm lại nếu giáo viên cho phép.</p>
        ) : (
          <p className="mt-1">Em có thể xem lại các phần ghi nhớ và làm thêm câu hỏi tự kiểm tra để củng cố kiến thức.</p>
        )}
      </div>

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
