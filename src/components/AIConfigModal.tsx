import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Key, Cpu, CheckCircle2, AlertCircle, CirclePlay, Trash2, X } from 'lucide-react';
import { AI_MODELS } from '../constants';
import { AIConfig, AIConfigOpenReason, User } from '../types';
import { testGeminiKey } from '../services/gemini';

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  user?: User | null;
  onSave: (config: AIConfig) => void;
  onDelete?: () => void;
  setLoading: (loading: boolean) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  openReason?: AIConfigOpenReason;
}

const fieldClassName = 'w-full rounded-2xl border border-slate-200 bg-white py-3.5 px-4 outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15';

export default function AIConfigModal({ isOpen, onClose, config, user, onSave, onDelete, setLoading, showToast, openReason = 'manual' }: AIConfigModalProps) {
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model || AI_MODELS[0]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setApiKey(config.apiKey || '');
    setModel(config.model || AI_MODELS[0]);
    setTestResult(null);
  }, [config.apiKey, config.model, isOpen]);

  const handleTest = async () => {
    if (!apiKey) {
      showToast('Vui lòng nhập API Key', 'error');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const ok = await testGeminiKey(apiKey, model);
    setIsTesting(false);
    setTestResult(ok ? 'success' : 'error');
    if (ok) showToast('API Key hợp lệ', 'success');
    else showToast('API Key không hợp lệ hoặc lỗi kết nối', 'error');
  };

  const handleSave = () => {
    if (!apiKey) {
      showToast('Vui lòng nhập API Key', 'error');
      return;
    }
    setLoading(true);
    try {
      onSave({ apiKey, model });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="app-modal-overlay !z-[30050]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="app-modal-viewport">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="app-modal-panel mx-auto max-w-2xl"
          >
            <div className="flex items-start justify-between bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-5 text-white sm:px-7 sm:py-6">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <Settings className="h-4 w-4" /> Cấu hình Trợ lý AI
                </p>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Thiết lập Gemini API</h2>
                
              </div>
              <button onClick={onClose} className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="app-modal-body app-modal-body-padded app-scrollbar">
              <div className="space-y-5">
                <div className={`rounded-[24px] border p-4 shadow-sm ${config.hasServerKey ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className={`text-sm font-extrabold ${config.hasServerKey ? 'text-emerald-900' : 'text-amber-900'}`}>
                        {config.hasServerKey ? 'Tài khoản này đã cấu hình API key.' : 'Tài khoản này chưa cấu hình API key.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {user ? `${user.ho_ten} • ${user.ten_dang_nhap}` : 'Cấu hình đang gắn với phiên đăng nhập hiện tại.'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-amber-600"
                      >
                        <Key className="h-4 w-4" />
                        Lấy API key
                      </a>
                      <a
                        href="https://youtu.be/XoP-e8_Joig?si=4U5cSGRGluuKPthM"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-xs font-bold text-amber-700 shadow-sm transition-all hover:bg-amber-50"
                      >
                        <CirclePlay className="h-4 w-4" />
                        Video hướng dẫn lấy API key
                      </a>
                    </div>
                  </div>
                </div>

                {openReason === 'quota' && (
                  <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold">API Key hiện tại đã hết hạn mức sử dụng.</p>
                      <p className="mt-1 text-xs leading-5 text-red-600">Hãy thay API Key khác hoặc cập nhật lại cấu hình để tiếp tục tạo bài học mới và sử dụng trợ lý AI.</p>
                    </div>
                  </div>
                )}

                <section className="app-modal-section">
                  <div className="mb-4">
                    <p className="app-modal-section-title">Thông tin kết nối</p>
                    <p className="app-modal-section-description">Sau khi lưu, cấu hình sẽ được đồng bộ lên hệ thống để dùng lại trên thiết bị khác sau khi đăng nhập.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-text-main">
                        <Key className="h-4 w-4" /> Gemini API Key
                      </label>
                      {config.hasServerKey && (
                        <p className="text-[11px] text-emerald-700">Đang dùng API key của tài khoản hiện tại{config.apiKeyMasked ? ` (${config.apiKeyMasked})` : ''}{config.updatedAt ? ` • ${config.updatedAt}` : ''}</p>
                      )}
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className={fieldClassName}
                        placeholder="Nhập API Key của bạn"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-text-main">
                        <Cpu className="h-4 w-4" /> Mô hình AI
                      </label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className={`${fieldClassName} appearance-none`}
                      >
                        {AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </section>

                {testResult && (
                  <div className={`flex items-center gap-2 rounded-2xl p-3 text-sm font-medium ${testResult === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {testResult === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {testResult === 'success' ? 'Kết nối thành công!' : 'Lỗi kết nối, vui lòng kiểm tra lại key.'}
                  </div>
                )}
              </div>
            </div>

            <div className="app-modal-footer">
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-text-main transition-all hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                {isTesting ? 'Đang thử...' : 'Kiểm tra'}
              </button>
              {config.hasServerKey && onDelete && (
                <button
                  onClick={() => {
                    if (window.confirm('Xóa API key của tài khoản hiện tại?')) {
                      onDelete();
                      onClose();
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" /> Xóa API key
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-all hover:bg-indigo-700"
              >
                Lưu theo tài khoản
              </button>
            </div>
          </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
