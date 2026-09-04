import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, UploadCloud, UsersRound } from 'lucide-react';
import type {
  FirebaseAccountMigrationSource,
  FirebaseAccountMigrationStatus,
} from '../services/firebase';

interface FirebaseAccountMigrationPanelProps {
  source: FirebaseAccountMigrationSource | null;
  status: FirebaseAccountMigrationStatus | null;
  isMigrating: boolean;
  processed: number;
  total: number;
  canMigrate: boolean;
  onMigrate: () => void;
  onRefresh: () => void;
}

function presentation(status: FirebaseAccountMigrationStatus | null) {
  if (!status?.available) {
    return { label: 'Chưa kiểm tra Firebase', className: 'bg-slate-100 text-slate-600' };
  }
  if (status.current) {
    return { label: 'Đã chuyển đổi và đang sử dụng', className: 'bg-emerald-50 text-emerald-700' };
  }
  if (status.complete) {
    return { label: 'Cần xác nhận lại phiên bản nguồn', className: 'bg-amber-50 text-amber-700' };
  }
  return { label: 'Còn tài khoản chưa chuyển đổi', className: 'bg-indigo-50 text-indigo-700' };
}

export default function FirebaseAccountMigrationPanel({
  source,
  status,
  isMigrating,
  processed,
  total,
  canMigrate,
  onMigrate,
  onRefresh,
}: FirebaseAccountMigrationPanelProps) {
  const state = presentation(status);
  const resetAccounts = source?.accounts.filter((item) => item.password_reset_required) || [];
  const progressPercent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <section className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-indigo-100">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Firebase Account Identity V1
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Chuyển tài khoản sang Firebase Authentication</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Người dùng tiếp tục nhập tên đăng nhập cũ. Hệ thống tự ánh xạ sang email Firebase nội bộ,
            tạo hồ sơ <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">members</code> và giữ Google Sheet làm dữ liệu dự phòng.
          </p>
        </div>
        <div className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${state.className}`}>
          {status?.current ? <CheckCircle2 className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
          {state.label}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Nguồn Google Sheet</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{source?.counts.total ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Đã có trên Firebase</div>
          <div className="mt-2 text-2xl font-bold text-emerald-800">{status?.migratedCount ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-indigo-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-indigo-700">Còn chờ chuyển</div>
          <div className="mt-2 text-2xl font-bold text-indigo-800">{status?.pendingCount ?? source?.counts.total ?? 0}</div>
        </div>
        <div className={`rounded-2xl p-4 ${resetAccounts.length ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <div className={`text-xs font-bold uppercase tracking-wide ${resetAccounts.length ? 'text-amber-700' : 'text-slate-500'}`}>Cần đặt lại mật khẩu</div>
          <div className={`mt-2 text-2xl font-bold ${resetAccounts.length ? 'text-amber-800' : 'text-slate-900'}`}>{resetAccounts.length}</div>
        </div>
      </div>

      {resetAccounts.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Mật khẩu Firebase tối thiểu 6 ký tự.</p>
              <p>
                {resetAccounts.map((item) => item.username).join(', ')} sẽ được đặt mật khẩu khởi tạo là <strong>123456</strong>.
                Google Sheet được cập nhật tự động sau khi tạo tài khoản thành công.
              </p>
            </div>
          </div>
        </div>
      )}

      {status && status.mismatchCount > 0 && (
        <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Có {status.mismatchCount} hồ sơ Firebase chưa khớp vai trò, lớp hoặc trạng thái nguồn. Nhấn chuyển đổi để cập nhật lại.
        </div>
      )}

      {isMigrating && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-600">
            <span>Đang chuyển đổi theo nhóm an toàn...</span>
            <span>{processed}/{total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isMigrating}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isMigrating ? 'animate-spin' : ''}`} /> Kiểm tra lại
        </button>
        <button
          type="button"
          onClick={onMigrate}
          disabled={!canMigrate || isMigrating || status?.current === true}
          className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          <UploadCloud className="h-4 w-4" />
          {status?.migratedCount ? 'Tiếp tục chuyển đổi' : 'Bắt đầu chuyển tài khoản'}
        </button>
      </div>
    </section>
  );
}
