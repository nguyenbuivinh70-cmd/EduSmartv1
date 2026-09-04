import { Loader2, Wand2 } from 'lucide-react';

export default function AIRevisionPanel({ value, onChange, onRevise, disabled, loading }: { value: string; onChange: (value: string) => void; onRevise: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <div className="rounded-[26px] border border-fuchsia-100 bg-fuchsia-50/60 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-fuchsia-900">
        <Wand2 className="h-4 w-4" /> Yêu cầu AI điều chỉnh bài học
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-2xl border border-fuchsia-100 bg-white px-4 py-3 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
        placeholder="Ví dụ: rút gọn nội dung, thêm video gợi ý, tăng câu hỏi đúng/sai, làm câu hỏi dễ hơn..."
      />
      <div className="mt-3 flex justify-end">
        <button onClick={onRevise} disabled={disabled || loading || !value.trim()} className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-600 px-4 py-3 text-sm font-bold text-white hover:bg-fuchsia-700 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {loading ? 'AI đang điều chỉnh...' : 'AI điều chỉnh bài học'}
        </button>
      </div>
    </div>
  );
}
