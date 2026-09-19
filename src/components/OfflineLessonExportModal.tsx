import { useEffect, useMemo, useState } from 'react';
import { Archive, Download, FileText, Film, Link2, MonitorDown, Upload, WifiOff, X } from 'lucide-react';
import type { Lesson } from '../types';
import type { OfflineLessonExportOptions, OfflineExportFormat, OfflineVideoMode } from '../utils/offlineLessonExporter';

interface Props {
  isOpen: boolean;
  lesson: Lesson | null;
  isExporting: boolean;
  onClose: () => void;
  onExport: (options: OfflineLessonExportOptions) => Promise<void> | void;
}

export default function OfflineLessonExportModal({ isOpen, lesson, isExporting, onClose, onExport }: Props) {
  const [format, setFormat] = useState<OfflineExportFormat>('zip');
  const [videoMode, setVideoMode] = useState<OfflineVideoMode>('omit');
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormat('zip');
    setVideoMode(lesson?.intro_video_url || lesson?.intro_video_embed_url ? 'link' : 'omit');
    setLocalVideoFile(null);
  }, [isOpen, lesson?.lesson_id]);

  const localVideoHint = useMemo(() => {
    if (!localVideoFile) return 'Chọn MP4/WebM giáo viên có quyền sử dụng. Khuyến nghị dưới 150 MB.';
    return `${localVideoFile.name} • ${(localVideoFile.size / 1024 / 1024).toFixed(1)} MB`;
  }, [localVideoFile]);

  if (!isOpen || !lesson) return null;

  return (
    <div className="fixed inset-0 z-[12750] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={isExporting ? undefined : onClose} aria-label="Đóng" />
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[30px] bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em]"><WifiOff className="h-4 w-4" /> Xuất bài học Offline</p>
              <h2 className="mt-2 text-2xl font-black">{lesson.tieu_de}</h2>
              <p className="mt-1 text-sm text-white/85">Tạo gói bài học độc lập để mở trực tiếp bằng trình duyệt trên máy tính.</p>
            </div>
            <button type="button" onClick={onClose} disabled={isExporting} className="rounded-full bg-white/15 p-2 hover:bg-white/25 disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-6">
          <section>
            <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">1. Định dạng xuất</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setFormat('zip')} className={`rounded-2xl border p-4 text-left transition ${format === 'zip' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="flex items-center gap-2 font-black text-slate-900"><Archive className="h-5 w-5 text-indigo-600" /> ZIP Offline đầy đủ</span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">Mặc định. Có index.html, dữ liệu bài học, hướng dẫn và có thể kèm video cục bộ.</span>
              </button>
              <button type="button" onClick={() => setFormat('html')} className={`rounded-2xl border p-4 text-left transition ${format === 'html' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="flex items-center gap-2 font-black text-slate-900"><FileText className="h-5 w-5 text-violet-600" /> Một file HTML</span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">Thuận tiện để sao chép. Video cục bộ sẽ được nhúng vào file nên kích thước có thể lớn.</span>
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">2. Video chuẩn bị</h3>
            <div className="mt-3 grid gap-3">
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${videoMode === 'omit' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                <input type="radio" checked={videoMode === 'omit'} onChange={() => { setVideoMode('omit'); setLocalVideoFile(null); }} className="mt-1" />
                <span><b>Bỏ video khỏi gói Offline</b><small className="mt-1 block text-slate-500">Toàn bộ nội dung và câu hỏi vẫn dùng được khi không có Internet.</small></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${videoMode === 'link' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                <input type="radio" checked={videoMode === 'link'} onChange={() => { setVideoMode('link'); setLocalVideoFile(null); }} className="mt-1" />
                <span><b className="inline-flex items-center gap-2"><Link2 className="h-4 w-4" /> Giữ liên kết video hiện tại</b><small className="mt-1 block text-slate-500">Phần video cần Internet; nội dung còn lại vẫn chạy offline.</small></span>
              </label>
              <label className={`rounded-2xl border p-4 ${videoMode === 'local' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                <span className="flex cursor-pointer items-start gap-3"><input type="radio" checked={videoMode === 'local'} onChange={() => setVideoMode('local')} className="mt-1" /><span><b className="inline-flex items-center gap-2"><Film className="h-4 w-4" /> Đóng gói video cục bộ</b><small className="mt-1 block text-slate-500">Dùng file video giáo viên đã có sẵn và có quyền sử dụng.</small></span></span>
                {videoMode === 'local' ? (
                  <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-white px-4 py-3 text-sm font-bold text-indigo-700">
                    <Upload className="h-4 w-4" /> Chọn file video
                    <input type="file" accept="video/mp4,video/webm,video/ogg" className="hidden" onChange={(event) => setLocalVideoFile(event.target.files?.[0] || null)} />
                    <span className="ml-auto max-w-[55%] truncate text-xs font-semibold text-slate-500">{localVideoHint}</span>
                  </label>
                ) : null}
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            <b className="inline-flex items-center gap-2"><MonitorDown className="h-4 w-4" /> Gói Offline độc lập</b>
            <p className="mt-1">Không chứa API key, token đăng nhập, UID học sinh, dữ liệu lớp, bình luận hoặc điểm của người học khác. Tiến độ offline chỉ lưu trên trình duyệt của máy đang sử dụng.</p>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <p className="text-xs font-semibold text-slate-500">Mở file bằng Chrome, Edge hoặc Firefox. Không cần cài phần mềm bổ sung.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={isExporting} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
            <button type="button" disabled={isExporting || (videoMode === 'local' && !localVideoFile)} onClick={() => void onExport({ format, videoMode, localVideoFile })} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Download className="h-4 w-4" /> {isExporting ? 'Đang tạo gói…' : format === 'zip' ? 'Xuất ZIP Offline' : 'Xuất HTML Offline'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
