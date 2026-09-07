import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';

export interface AccountOperationCredentials {
  current_password?: string;
  auth_deleted_in_console?: boolean;
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  isSubmitting?: boolean;
  requiredText?: string;
  requiredTextLabel?: string;
  accountOperation?: 'delete' | 'reset';
  onConfirm: (credentials?: AccountOperationCredentials) => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'danger',
  isSubmitting = false,
  requiredText = '',
  requiredTextLabel = '',
  accountOperation,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [deletedInConsole, setDeletedInConsole] = useState(false);
  const normalizedRequiredText = String(requiredText || '').trim();
  const isTextConfirmationRequired = !!normalizedRequiredText;
  const isConfirmDisabled = isSubmitting || (isTextConfirmationRequired && typedText.trim().toUpperCase() !== normalizedRequiredText.toUpperCase());

  useEffect(() => {
    setTypedText(''); setCurrentPassword(''); setDeletedInConsole(false);
  }, [isOpen, requiredText, accountOperation]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="app-modal-overlay">
          <div className="app-modal-viewport">
          <motion.div initial={{ y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.96 }} className="app-modal-panel mx-auto max-w-lg">
            <div className={`flex items-start justify-between px-6 py-5 text-white sm:px-7 sm:py-6 ${variant === 'danger' ? 'bg-gradient-to-r from-rose-600 to-red-500' : 'bg-gradient-to-r from-indigo-600 to-violet-600'}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${variant === 'danger' ? 'bg-white/15 text-white' : 'bg-white/15 text-white'}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Xác nhận thao tác</p>
                  <h3 className="mt-3 text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/85">{description}</p>
                </div>
              </div>
              <button onClick={onClose} disabled={isSubmitting} className="rounded-full bg-white/15 p-2 transition hover:bg-white/25 disabled:opacity-60">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="app-modal-body app-modal-body-padded app-scrollbar">
              {accountOperation && (
                <div className="mb-4 space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-slate-700">
                  <label className="block font-semibold">
                    Mật khẩu hiện tại của tài khoản cần xử lý
                    <input type="password" autoComplete="off" value={currentPassword}
                      onChange={event => setCurrentPassword(event.target.value)} disabled={isSubmitting || deletedInConsole}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-indigo-500 disabled:opacity-50"
                      placeholder="Nhập khi đã đổi mật khẩu ban đầu" />
                  </label>
                  <p className="text-xs leading-5">Mật khẩu chỉ dùng cho lần xác thực này. Khi chọn nhiều tài khoản, giá trị nhập áp dụng cho cả nhóm. Tài khoản không xác thực được sẽ báo lỗi riêng.</p>
                  {accountOperation === 'delete' ? (
                    <>
                      <a href="https://console.firebase.google.com/project/hthtv1/authentication/users" target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-indigo-700 underline">Mở Firebase Console để xóa danh tính đăng nhập</a>
                      <label className="flex items-start gap-2 font-medium">
                        <input type="checkbox" checked={deletedInConsole} disabled={isSubmitting}
                          onChange={event => { setDeletedInConsole(event.target.checked); setCurrentPassword(''); }} className="mt-1" />
                        <span>Tôi đã kiểm tra và xóa danh tính đăng nhập của tất cả tài khoản đang chọn trong Firebase Console, hoặc xác nhận chúng chưa từng được tạo.</span>
                      </label>
                      <p className="text-xs leading-5">Chỉ đánh dấu sau khi hoàn tất kiểm tra. Ứng dụng sẽ dọn dữ liệu dựa trên xác nhận này và không tự xác minh thao tác trong Console.</p>
                    </>
                  ) : <p className="text-xs leading-5">Nếu đã quên mật khẩu, mô hình hiện tại không thể ép đặt lại mật khẩu Firebase của người khác. Liên hệ chủ tài khoản hoặc dùng khôi phục qua email thật nếu tài khoản có email nhận được thư.</p>}
                </div>
              )}
              {isTextConfirmationRequired ? (
                <div className="rounded-[24px] border border-rose-100 bg-rose-50/70 p-4">
                  <label className="block text-sm font-bold text-rose-700">{requiredTextLabel || `Nhập ${normalizedRequiredText} để xác nhận`}</label>
                  <input
                    value={typedText}
                    onChange={(event) => setTypedText(event.target.value)}
                    placeholder={normalizedRequiredText}
                    disabled={isSubmitting}
                    className="mt-3 w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="mt-2 text-xs font-semibold text-rose-600">Nút xác nhận chỉ mở khi nhập đúng {normalizedRequiredText}.</p>
                </div>
              ) : (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                  Vui lòng kiểm tra kỹ trước khi tiếp tục. Một số thao tác có thể làm thay đổi dữ liệu và không thể hoàn tác hoàn toàn.
                </div>
              )}
            </div>
            <div className="app-modal-footer">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => onConfirm(accountOperation ? { current_password: currentPassword, auth_deleted_in_console: accountOperation === 'delete' && deletedInConsole } : undefined)}
                disabled={isConfirmDisabled}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${variant === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
