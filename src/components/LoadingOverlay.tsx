import { motion, AnimatePresence } from 'motion/react';
import { LoaderCircle, MonitorUp } from 'lucide-react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
}

export default function LoadingOverlay({ isLoading, message = 'Đang xử lý...' }: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[40000] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-label="Thông báo tiến trình"
        >
          <motion.div
            initial={{ y: 18, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-2xl shadow-slate-950/25"
          >
            <div className="h-1.5 w-full overflow-hidden bg-indigo-100">
              <motion.div
                className="h-full w-1/3 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500"
                animate={{ x: ['-120%', '320%'] }}
                transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
              />
            </div>
            <div className="px-6 py-7 text-center sm:px-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                  <LoaderCircle className="h-9 w-9 text-indigo-600" />
                </motion.div>
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Đang xử lý</p>
              <p className="mt-2 text-base font-black leading-6 text-slate-900 sm:text-lg">{message}</p>
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left text-xs leading-5 text-slate-600 ring-1 ring-slate-100">
                <MonitorUp className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>Vui lòng giữ màn hình này và không tải lại trang cho đến khi hệ thống hoàn tất thao tác.</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
