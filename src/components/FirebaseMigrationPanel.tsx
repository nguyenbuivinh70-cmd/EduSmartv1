import { AlertTriangle, CheckCircle2, CloudUpload, Database, Loader2, RefreshCw } from 'lucide-react';
import type { FirebaseBaseCatalogCounts, FirebaseBaseCatalogStatus } from '../services/firebase';

interface FirebaseMigrationPanelProps {
  status: FirebaseBaseCatalogStatus | null;
  sourceCounts: FirebaseBaseCatalogCounts | null;
  isSyncing: boolean;
  canMigrate: boolean;
  onMigrate: () => void;
  onRefresh: () => void;
}

function statusPresentation(status: FirebaseBaseCatalogStatus | null) {
  if (!status?.available) {
    return {
      label: 'Chưa có phiên Firebase',
      description: 'Hãy đăng nhập bằng email Firebase để thực hiện đồng bộ.',
      className: 'bg-slate-100 text-slate-600',
      icon: <AlertTriangle className="h-4 w-4" />,
    };
  }
  if (status.current) {
    return {
      label: 'Đã đồng bộ và đang sử dụng',
      description: 'Ba danh mục nền trên Firestore trùng khớp với dữ liệu nguồn Google Sheet.',
      className: 'bg-emerald-50 text-emerald-700',
      icon: <CheckCircle2 className="h-4 w-4" />,
    };
  }
  if (status.complete) {
    return {
      label: 'Cần đồng bộ lại',
      description: 'Google Sheet đã thay đổi sau lần đồng bộ gần nhất; ứng dụng đang dùng dữ liệu Sheet để tránh lệch dữ liệu.',
      className: 'bg-amber-50 text-amber-700',
      icon: <AlertTriangle className="h-4 w-4" />,
    };
  }
  return {
    label: 'Chưa đồng bộ',
    description: 'Firestore chưa có đủ dữ liệu Năm học, Lớp học và Môn học.',
    className: 'bg-indigo-50 text-indigo-700',
    icon: <Database className="h-4 w-4" />,
  };
}

export default function FirebaseMigrationPanel({ status, sourceCounts, isSyncing, canMigrate, onMigrate, onRefresh }: FirebaseMigrationPanelProps) {
  const presentation = statusPresentation(status);
  const source = sourceCounts || { school_years: 0, classes: 0, subjects: 0 };
  const target = status?.counts || { school_years: 0, classes: 0, subjects: 0 };
  const rows = [
    { label: 'Năm học', source: source.school_years, target: target.school_years },
    { label: 'Lớp học', source: source.classes, target: target.classes },
    { label: 'Môn học', source: source.subjects, target: target.subjects },
  ];

  return (
    <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-indigo-100">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            <Database className="h-3.5 w-3.5" /> Firebase Data Migration V1
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-900">Đồng bộ danh mục nền lên Firestore</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Cơ chế này giữ nguyên mã dữ liệu, cập nhật theo kiểu upsert và loại bỏ bản ghi Firestore không còn trong nguồn. Google Sheet vẫn được giữ làm dữ liệu dự phòng trong giai đoạn chuyển đổi.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 self-start rounded-2xl px-4 py-2 text-sm font-bold ${presentation.className}`}>
          {presentation.icon}{presentation.label}
        </div>
      </div>

      <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${presentation.className}`}>{presentation.description}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => {
          const matches = row.source > 0 && row.source === row.target;
          return (
            <div key={row.label} className={`rounded-2xl border p-4 ${matches ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{row.label}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div><span className="text-2xl font-extrabold text-slate-900">{row.target}</span><span className="ml-1 text-xs text-slate-500">Firestore</span></div>
                <div className="text-right text-xs font-semibold text-slate-500">Nguồn: {row.source}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-slate-500">Chưa chuyển tài khoản, bài học, nhật ký và tiến độ học tập trong đợt này.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={isSyncing} onClick={onRefresh} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} /> Kiểm tra lại
          </button>
          <button disabled={!canMigrate || isSyncing} onClick={onMigrate} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
            {isSyncing ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang đồng bộ...</> : <><CloudUpload className="h-4 w-4" /> {status?.complete ? 'Đồng bộ lại' : 'Bắt đầu đồng bộ'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
