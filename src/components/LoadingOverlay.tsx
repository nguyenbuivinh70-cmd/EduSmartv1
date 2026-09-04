import { motion, AnimatePresence } from 'motion/react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
}

export default function LoadingOverlay({ isLoading, message = 'Đang tải...' }: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm"
        >
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent"
            ></motion.div>
          </div>
          <p className="mt-4 font-medium text-gray-700">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
