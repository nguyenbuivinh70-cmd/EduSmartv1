import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Link2, MonitorPlay, Save, Settings2, ShieldCheck, Users } from 'lucide-react';
import { buildYoutubeEmbedUrl } from '../services/api';
import { Role, VideoDisplayMode, VideoPopupConfig } from '../types';

interface VideoConfigPanelProps {
  config: VideoPopupConfig;
  isSubmitting: boolean;
  onSave: (config: VideoPopupConfig) => void;
  onPreview: (config: VideoPopupConfig) => void;
}

const DISPLAY_MODE_OPTIONS: Array<{ value: VideoDisplayMode; label: string; hint: string }> = [
  { value: 'every_visit', label: 'Hiện mỗi lần truy cập', hint: 'Phù hợp khi muốn luôn nhắc người dùng xem video.' },
  { value: 'session_once', label: 'Hiện 1 lần mỗi phiên đăng nhập', hint: 'Hiện 1 lần rồi ẩn trong suốt phiên làm việc hiện tại.' },
  { value: 'daily_once', label: 'Hiện 1 lần mỗi ngày', hint: 'Giảm cảm giác lặp lại với người dùng truy cập thường xuyên.' },
];

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'student', label: 'Học sinh' },
];

export default function VideoConfigPanel({ config, isSubmitting, onSave, onPreview }: VideoConfigPanelProps) {
  const [draft, setDraft] = useState<VideoPopupConfig>(config);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const embedUrl = useMemo(() => buildYoutubeEmbedUrl(draft.youtubeUrl), [draft.youtubeUrl]);
  const canPreview = Boolean(embedUrl);

  const updateField = <K extends keyof VideoPopupConfig>(key: K, value: VideoPopupConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleRole = (role: Role) => {
    setDraft((current) => {
      const exists = current.targetRoles.includes(role);
      const targetRoles = exists ? current.targetRoles.filter((item) => item !== role) : [...current.targetRoles, role];
      return { ...current, targetRoles };
    });
  };

  const handleSave = () => {
    onSave({
      ...draft,
      embedUrl,
      targetRoles: draft.targetRoles.length ? draft.targetRoles : ['admin', 'teacher', 'student'],
    });
  };

  const handlePreview = () => {
    onPreview({
      ...draft,
      embedUrl,
      targetRoles: draft.targetRoles.length ? draft.targetRoles : ['admin', 'teacher', 'student'],
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] bg-gradient-to-r from-red-600 via-rose-500 to-orange-500 px-8 py-8 text-white shadow-[0_24px_60px_rgba(225,29,72,0.25)]">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
            <MonitorPlay className="h-4 w-4" /> Popup video khi truy cập
          </p>
          <h1 className="mt-4 text-3xl font-black uppercase leading-tight">Cấu hình video giới thiệu hiển thị khi người dùng mở ứng dụng</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/90">
            Admin có thể bật hoặc tắt popup video, thay đổi link YouTube, chỉnh tiêu đề dự thi và chọn cách hiển thị cho từng nhóm người dùng.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Thiết lập hiển thị video</h2>
              <p className="mt-1 text-sm text-slate-500">Đây là cấu hình trung tâm cho popup video mở khi người dùng truy cập hệ thống.</p>
            </div>
            <div className={`rounded-2xl px-4 py-2 text-sm font-semibold ${draft.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {draft.enabled ? 'Đang bật' : 'Đang tắt'}
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div>
                <p className="font-semibold text-slate-900">Bật hiển thị popup video</p>
                <p className="mt-1 text-sm text-slate-500">Tắt mục này nếu bạn tạm thời không muốn video xuất hiện khi người dùng vào ứng dụng.</p>
              </div>
              <button
                type="button"
                onClick={() => updateField('enabled', !draft.enabled)}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition ${draft.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${draft.enabled ? 'translate-x-9' : 'translate-x-1'}`} />
              </button>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Link2 className="h-4 w-4" /> Link video YouTube
              </label>
              <input
                value={draft.youtubeUrl}
                onChange={(e) => updateField('youtubeUrl', e.target.value)}
                placeholder="Dán link YouTube tại đây"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
              />
              <p className="mt-2 text-xs text-slate-500">Hỗ trợ link dạng youtube.com/watch, youtu.be, shorts hoặc live. Hệ thống sẽ tự chuyển sang link nhúng.</p>
              {embedUrl && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Link nhúng hợp lệ: {embedUrl}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Tiêu đề 1</label>
                <input value={draft.title1} onChange={(e) => updateField('title1', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Tiêu đề 2</label>
                <input value={draft.title2} onChange={(e) => updateField('title2', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Tiêu đề 3</label>
              <input value={draft.title3} onChange={(e) => updateField('title3', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100" />
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Settings2 className="h-4 w-4" /> Mô tả ngắn dưới tiêu đề
              </label>
              <textarea
                rows={4}
                value={draft.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <MonitorPlay className="h-4 w-4" /> Chế độ hiển thị
                </label>
                <select
                  value={draft.displayMode}
                  onChange={(e) => updateField('displayMode', e.target.value as VideoDisplayMode)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                >
                  {DISPLAY_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">{DISPLAY_MODE_OPTIONS.find((item) => item.value === draft.displayMode)?.hint}</p>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <ShieldCheck className="h-4 w-4" /> Nút đóng popup
                </label>
                <button
                  type="button"
                  onClick={() => updateField('dismissible', !draft.dismissible)}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${draft.dismissible ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}
                >
                  {draft.dismissible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {draft.dismissible ? 'Cho phép người dùng tự đóng' : 'Không cho đóng bằng thao tác ngoài'}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Users className="h-4 w-4" /> Đối tượng hiển thị
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ROLE_OPTIONS.map((role) => {
                  const active = draft.targetRoles.includes(role.value);
                  return (
                    <button
                      type="button"
                      key={role.value}
                      onClick={() => toggleRole(role.value)}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${active ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={handlePreview}
                disabled={!canPreview}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Eye className="h-4 w-4" /> Xem trước popup
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {isSubmitting ? 'Đang lưu...' : 'Lưu cấu hình video'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Tóm tắt cấu hình đang áp dụng</h3>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">Trạng thái:</span> {draft.enabled ? 'Bật hiển thị' : 'Đang tắt'}</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">Vai trò:</span> {(draft.targetRoles.length ? draft.targetRoles : ROLE_OPTIONS.map((item) => item.value)).join(', ')}</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">Chế độ:</span> {DISPLAY_MODE_OPTIONS.find((item) => item.value === draft.displayMode)?.label}</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">Nút đóng:</span> {draft.dismissible ? 'Cho phép người dùng đóng popup' : 'Chỉ đóng bằng nút chính'}</div>
              {draft.updatedAt && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-700"><span className="font-semibold">Cập nhật gần nhất:</span> {draft.updatedAt}</div>}
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Lưu ý triển khai</h3>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <p>• Popup video sẽ hiển thị khi người dùng đăng nhập và thỏa điều kiện vai trò, chế độ hiển thị, trạng thái bật/tắt.</p>
              <p>• Để áp dụng cho toàn hệ thống trên nhiều thiết bị, Apps Script cần hỗ trợ hai action mới: <span className="font-semibold text-slate-900">getVideoConfig</span> và <span className="font-semibold text-slate-900">saveVideoConfig</span>.</p>
              <p>• Nếu backend chưa cập nhật, app vẫn lưu tạm cấu hình trên trình duyệt hiện tại để bạn xem trước giao diện và thử nghiệm nhanh.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
