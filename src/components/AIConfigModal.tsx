import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Key, Cpu, CheckCircle2, AlertCircle, CirclePlay, Trash2, X, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { AI_MODELS } from '../constants';
import { AIConfig, AIConfigOpenReason, User } from '../types';
import { GeminiKeyTestResult, testGeminiKey } from '../services/gemini';

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  user?: User | null;
  onSave: (config: AIConfig) => Promise<boolean | void> | boolean | void;
  onDelete?: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  openReason?: AIConfigOpenReason;
}

const fieldClassName = 'w-full rounded-2xl border border-slate-200 bg-white py-3.5 px-4 outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15';

export default function AIConfigModal({ isOpen, onClose, config, user, onSave, onDelete, showToast, openReason = 'manual' }: AIConfigModalProps) {
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model || AI_MODELS[0]);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<GeminiKeyTestResult | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setApiKey(config.apiKey || '');
    setModel(config.model || AI_MODELS[0]);
    setTestResult(null);
    setAvailableModels([]);
    setShowKey(false);
  }, [config.apiKey, config.model, isOpen]);

  const modelOptions = useMemo(
    () => Array.from(new Set([model, ...AI_MODELS, ...availableModels])).filter(Boolean),
    [model, availableModels],
  );

  const validateCurrentKey = async () => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      const result: GeminiKeyTestResult = {
        ok: false,
        keyValid: false,
        model,
        code: 'INVALID_KEY',
        message: 'Vui lòng nhập Gemini API Key.',
      };
      setTestResult(result);
      return result;
    }

    setIsTesting(true);
    try {
      const result = await testGeminiKey(cleanKey, model);
      setTestResult(result);
      setAvailableModels(result.availableModels || []);
      if (result.model && result.model !== model && (result.ok || result.keyValid)) setModel(result.model);
      return result;
    } finally {
      setIsTesting(false);
    }
  };

  const handleTest = async () => {
    const result = await validateCurrentKey();
    showToast(result.message, result.ok ? 'success' : 'error');
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      showToast('Vui lòng nhập Gemini API Key.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // V6.88.13: kiểm tra key và model trước khi lưu. models.list giúp phân biệt
      // key hợp lệ với trường hợp model cũ không còn được dự án hiện tại cấp quyền.
      const result = await testGeminiKey(apiKey.trim(), model);
      setTestResult(result);
      setAvailableModels(result.availableModels || []);

      const canSave = result.ok || result.keyValid;
      if (!canSave) {
        showToast(result.message, 'error');
        return;
      }

      const resolvedModel = result.model || model || AI_MODELS[0];
      setModel(resolvedModel);
      const saved = await onSave({ apiKey: apiKey.trim(), model: resolvedModel });
      if (saved === false) return;

      if (result.code === 'QUOTA') {
        showToast('Đã lưu API key. Hạn mức Gemini hiện tại đang bị giới hạn; hãy thử lại khi hạn mức được làm mới.', 'error');
      }
      onClose();
    } finally {
      setIsSaving(false);
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
                  <p className="mt-1 text-xs text-white/75">Xác minh API key bằng danh mục model của Gemini và tự chọn mô hình phù hợp cho tài khoản hiện tại.</p>
                </div>
                <button onClick={onClose} className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25" aria-label="Đóng">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="app-modal-body app-modal-body-padded app-scrollbar">
                <div className="space-y-5">
                  <div className={`rounded-[24px] border p-4 shadow-sm ${config.hasServerKey ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className={`text-sm font-extrabold ${config.hasServerKey ? 'text-emerald-900' : 'text-amber-900'}`}>
                          {config.hasServerKey ? 'Tài khoản này đã lưu API key.' : 'Tài khoản này chưa cấu hình API key.'}
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
                          <Key className="h-4 w-4" /> Lấy API key
                        </a>
                        <a
                          href="https://youtu.be/XoP-e8_Joig?si=4U5cSGRGluuKPthM"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-xs font-bold text-amber-700 shadow-sm transition-all hover:bg-amber-50"
                        >
                          <CirclePlay className="h-4 w-4" /> Video hướng dẫn lấy API key
                        </a>
                      </div>
                    </div>
                  </div>

                  {openReason === 'quota' && (
                    <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold">API Key hiện tại đã hết hạn mức sử dụng.</p>
                        <p className="mt-1 text-xs leading-5 text-red-600">Hãy thay API Key khác hoặc chờ hạn mức được làm mới để tiếp tục sử dụng các tính năng AI.</p>
                      </div>
                    </div>
                  )}

                  <section className="app-modal-section">
                    <div className="mb-4">
                      <p className="app-modal-section-title">Thông tin kết nối</p>
                      <p className="app-modal-section-description">Hệ thống xác minh API key bằng Gemini Models API, xác định các mô hình có quyền tạo nội dung và tự chọn mô hình phù hợp nếu cấu hình cũ không còn khả dụng.</p>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-text-main">
                          <Key className="h-4 w-4" /> Gemini API Key
                        </label>
                        {config.hasServerKey && (
                          <p className="text-[11px] text-emerald-700">Đã lưu theo tài khoản{config.apiKeyMasked ? ` (${config.apiKeyMasked})` : ''}{config.updatedAt ? ` • ${config.updatedAt}` : ''}</p>
                        )}
                        <div className="relative">
                          <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                            className={`${fieldClassName} pr-12`}
                            placeholder="Dán API Key được tạo trong Google AI Studio"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey((current) => !current)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label={showKey ? 'Ẩn API key' : 'Hiện API key'}
                            title={showKey ? 'Ẩn API key' : 'Hiện API key'}
                          >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-text-main">
                          <Cpu className="h-4 w-4" /> Mô hình AI
                        </label>
                        <select
                          value={model}
                          onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
                          className={`${fieldClassName} appearance-none`}
                        >
                          {modelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        <p className="text-[11px] leading-5 text-slate-500">Ưu tiên các mô hình Gemini ổn định mới. Khi kiểm tra, hệ thống có thể tự đổi sang mô hình mà API key thực sự được cấp quyền.</p>
                      </div>
                    </div>
                  </section>

                  {testResult && (
                    <div className={`flex items-start gap-2 rounded-2xl p-3 text-sm font-medium ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : testResult.keyValid ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
                      {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                      <div>
                        <p>{testResult.message}</p>
                        {testResult.ok ? <p className="mt-1 text-xs opacity-80">Mô hình được cấu hình: {testResult.model}</p> : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="app-modal-footer">
                <button
                  onClick={() => void handleTest()}
                  disabled={isTesting || isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-text-main transition-all hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  {isTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
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
                <button onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Hủy</button>
                <button
                  onClick={() => void handleSave()}
                  disabled={isSaving || isTesting}
                  className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-all hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isSaving ? 'Đang kiểm tra và lưu...' : 'Kiểm tra & lưu'}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
