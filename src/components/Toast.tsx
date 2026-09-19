import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  const visibleMessage = message;
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <XCircle className="h-5 w-5 text-red-500" />,
    info: <AlertCircle className="h-5 w-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-100',
    error: 'bg-red-50 border-red-100',
    info: 'bg-blue-50 border-blue-100',
  };

  const safeType = type === 'success' || type === 'error' || type === 'info' ? type : 'info';

  return (
    <motion.div
      initial={{ opacity: 0, y: -36, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.96 }}
      className={`fixed left-1/2 top-[calc(env(safe-area-inset-top)+1rem)] z-[23000] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border p-4 shadow-xl sm:top-5 ${bgColors[safeType]}`}
    >
      <div className="flex-shrink-0">{icons[safeType]}</div>
      <p className="flex-1 text-sm font-medium text-gray-800">{visibleMessage}</p>
      <button onClick={onClose} className="rounded-full p-1 hover:bg-black/5">
        <X className="h-4 w-4 text-gray-500" />
      </button>
    </motion.div>
  );
}
