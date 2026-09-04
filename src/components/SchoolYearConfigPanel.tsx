import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Edit3, Loader2, LockKeyhole, Plus, Save, Star, X } from 'lucide-react';
import { SchoolYear } from '../types';

interface SchoolYearConfigPanelProps {
  items: SchoolYear[];
  isSubmitting?: boolean;
  onCreate: (payload: Partial<SchoolYear>) => Promise<boolean>;
  onUpdate: (payload: Partial<SchoolYear>) => Promise<boolean>;
  onSetCurrent: (namHocId: string) => Promise<boolean>;
}

const blankForm: Partial<SchoolYear> = {
  ten_nam_hoc: '',
  ngay_bat_dau: '',
  ngay_ket_thuc: '',
  trang_thai: 'dang_hoat_dong',
  la_hien_hanh: false,
  ghi_chu: '',
};

function statusLabel(value?: string) {
  switch (value) {
    case 'dang_hoat_dong': return 'Đang hoạt động';
    case 'tam_khoa': return 'Tạm khóa';
    case 'luu_tru': return 'Lưu trữ';
    case 'chua_mo': return 'Chưa mở';
    default: return value || 'Đang hoạt động';
  }
}

function statusTone(value?: string) {
  if (value === 'tam_khoa') return 'bg-amber-50 text-amber-700 ring-amber-100';
  if (value === 'luu_tru') return 'bg-slate-100 text-slate-600 ring-slate-200';
  if (value === 'chua_mo') return 'bg-sky-50 text-sky-700 ring-sky-100';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
}

export default function SchoolYearConfigPanel({ items, isSubmitting, onCreate, onUpdate, onSetCurrent }: SchoolYearConfigPanelProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolYear | null>(null);
  const [form, setForm] = useState<Partial<SchoolYear>>(blankForm);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => String(b.ten_nam_hoc).localeCompare(String(a.ten_nam_hoc), 'vi')), [items]);
  const current = sortedItems.find((item) => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true');
  const isBusy = Boolean(actionKey) || Boolean(isSubmitting);

  const runAction = async (key: string, action: () => Promise<boolean>) => {
    if (isBusy) return false;
    setActionKey(key);
    try {
      return await action();
    } finally {
      setActionKey(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...blankForm });
    setIsFormOpen(true);
  };

  const openEdit = (item: SchoolYear) => {
    setEditing(item);
    setForm({
      nam_hoc_id: item.nam_hoc_id,
      ten_nam_hoc: item.ten_nam_hoc,
      ngay_bat_dau: item.ngay_bat_dau || '',
      ngay_ket_thuc: item.ngay_ket_thuc || '',
      trang_thai: item.trang_thai || 'dang_hoat_dong',
      la_hien_hanh: item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true',
      ghi_chu: item.ghi_chu || '',
    });
    setIsFormOpen(true);
  };

  const submit = async () => {
    const payload = {
      ...form,
      ten_nam_hoc: String(form.ten_nam_hoc || '').trim(),
    };
    if (!payload.ten_nam_hoc) return;
    const ok = await runAction('submit', async () => (editing ? onUpdate(payload) : onCreate(payload)));
    if (ok) {
      setIsFormOpen(false);
      setEditing(null);
      setForm({ ...blankForm });
    }
  };

  const renderInlineSpinner = (label: string) => (
    <>
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"><CalendarDays className="h-3.5 w-3.5" /> Cấu hình năm học</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Quản lý năm học toàn hệ thống</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Tạo năm học, đặt năm học hiện hành và khóa/lưu trữ năm học cũ. Bài học mới và dữ liệu theo dõi học tập sẽ mặc định gắn theo năm học hiện hành.</p>
          </div>
          <button disabled={isBusy} onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
            <Plus className="h-4 w-4" /> Thêm năm học
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-700">
            <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-70">Năm học hiện hành</p>
            <p className="mt-1 text-2xl font-extrabold">{current?.ten_nam_hoc || '-'}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-700">
            <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-70">Đang hoạt động</p>
            <p className="mt-1 text-2xl font-extrabold">{items.filter((item) => item.trang_thai !== 'luu_tru').length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-slate-700">
            <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-70">Tổng năm học</p>
            <p className="mt-1 text-2xl font-extrabold">{items.length}</p>
          </div>
        </div>
      </div>

      {isBusy && (
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Hệ thống đang xử lý yêu cầu, vui lòng chờ trong giây lát...
        </div>
      )}

      {isFormOpen && (
        <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-indigo-100">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">{editing ? 'Chỉnh sửa năm học' : 'Thêm năm học mới'}</h2>
            <button disabled={isBusy} onClick={() => setIsFormOpen(false)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Tên năm học</label>
              <input disabled={isBusy} value={form.ten_nam_hoc || ''} onChange={(e) => setForm((prev) => ({ ...prev, ten_nam_hoc: e.target.value }))} placeholder="2025-2026" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Trạng thái</label>
              <select disabled={isBusy} value={form.trang_thai || 'dang_hoat_dong'} onChange={(e) => setForm((prev) => ({ ...prev, trang_thai: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                <option value="dang_hoat_dong">Đang hoạt động</option>
                <option value="chua_mo">Chưa mở</option>
                <option value="tam_khoa">Tạm khóa</option>
                <option value="luu_tru">Lưu trữ</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Ngày bắt đầu</label>
              <input disabled={isBusy} type="date" value={form.ngay_bat_dau || ''} onChange={(e) => setForm((prev) => ({ ...prev, ngay_bat_dau: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Ngày kết thúc</label>
              <input disabled={isBusy} type="date" value={form.ngay_ket_thuc || ''} onChange={(e) => setForm((prev) => ({ ...prev, ngay_ket_thuc: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
              <input disabled={isBusy} type="checkbox" checked={form.la_hien_hanh === true || String(form.la_hien_hanh).toLowerCase() === 'true'} onChange={(e) => setForm((prev) => ({ ...prev, la_hien_hanh: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
              Đặt làm năm học hiện hành sau khi lưu
            </label>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Ghi chú</label>
              <textarea disabled={isBusy} value={form.ghi_chu || ''} onChange={(e) => setForm((prev) => ({ ...prev, ghi_chu: e.target.value }))} rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button disabled={isBusy} onClick={() => setIsFormOpen(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Hủy</button>
            <button disabled={isBusy || !String(form.ten_nam_hoc || '').trim()} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{actionKey === 'submit' ? renderInlineSpinner(editing ? 'Đang cập nhật...' : 'Đang lưu...') : <><Save className="h-4 w-4" /> Lưu năm học</>}</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sortedItems.map((item) => {
          const isCurrent = item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true';
          return (
            <div key={item.nam_hoc_id || item.ten_nam_hoc} className="rounded-[26px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusTone(item.trang_thai)}`}>{statusLabel(item.trang_thai)}</span>
                    {isCurrent && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700"><Star className="h-3.5 w-3.5" /> Hiện hành</span>}
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">{item.ten_nam_hoc}</h3>
                  <p className="mt-1 text-sm text-slate-500">{item.ngay_bat_dau || '-'} → {item.ngay_ket_thuc || '-'}{item.ghi_chu ? ` • ${item.ghi_chu}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={isBusy} onClick={() => openEdit(item)} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"><Edit3 className="h-4 w-4" /> Sửa</button>
                  {!isCurrent && <button disabled={isBusy} onClick={() => void runAction(`current:${item.nam_hoc_id || item.ten_nam_hoc}`, async () => onSetCurrent(item.nam_hoc_id || item.ten_nam_hoc))} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">{actionKey === `current:${item.nam_hoc_id || item.ten_nam_hoc}` ? renderInlineSpinner('Đang đặt...') : <><CheckCircle2 className="h-4 w-4" /> Đặt hiện hành</>}</button>}
                  {item.trang_thai !== 'luu_tru' && <button disabled={isBusy} onClick={() => void runAction(`archive:${item.nam_hoc_id || item.ten_nam_hoc}`, async () => onUpdate({ ...item, trang_thai: 'luu_tru' }))} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60">{actionKey === `archive:${item.nam_hoc_id || item.ten_nam_hoc}` ? renderInlineSpinner('Đang lưu trữ...') : <><LockKeyhole className="h-4 w-4" /> Lưu trữ</>}</button>}
                </div>
              </div>
            </div>
          );
        })}
        {!sortedItems.length && <div className="rounded-[28px] bg-white py-16 text-center shadow-sm ring-1 ring-slate-100"><CalendarDays className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4 text-lg font-bold text-slate-900">Chưa có năm học</h3><p className="text-slate-500">Hãy tạo năm học đầu tiên để hệ thống quản lý dữ liệu theo năm học.</p></div>}
      </div>
    </div>
  );
}
