import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, PlayCircle, Trophy, X } from 'lucide-react';
import { VideoPopupConfig } from '../types';

interface WelcomeVideoModalProps {
  isOpen: boolean;
  config: VideoPopupConfig;
  onClose: () => void;
  previewMode?: boolean;
}

export default function WelcomeVideoModal({ isOpen, config, onClose, previewMode = false }: WelcomeVideoModalProps) {
  if (!config.embedUrl) return null;

  const canDismiss = previewMode || config.dismissible !== false;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10030] flex items-center justify-center p-3 sm:p-4 lg:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            onClick={() => {
              if (canDismiss) onClose();
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            transition={{ type: 'spring', stiffness: 240, damping: 24 }}
            className="relative z-[1] flex w-full max-w-[1080px] max-h-[92vh] flex-col overflow-hidden rounded-[26px] border border-white/20 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]"
          >
            {canDismiss && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 z-[2] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 sm:right-4 sm:top-4 sm:h-11 sm:w-11"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            <div className="bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-5 py-5 text-center text-white sm:px-7 sm:py-6 lg:px-10 lg:py-7">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-white/15 shadow-inner shadow-white/10 backdrop-blur sm:h-16 sm:w-16">
                <Trophy className="h-7 w-7 sm:h-8 sm:w-8" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-100 sm:text-sm md:text-base">{config.title1}</p>
              <h2 className="mt-2 text-xl font-black uppercase leading-tight sm:text-2xl md:text-[2rem] lg:text-[2.35rem]">{config.title2}</h2>
              <p className="mx-auto mt-2 max-w-4xl text-xs font-semibold uppercase leading-5 text-white/95 sm:text-sm sm:leading-6 md:text-base lg:text-lg">
                {config.title3}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto bg-white px-4 py-4 sm:px-5 sm:py-5 md:px-6 lg:px-7">
              <div className="space-y-4">
                <div className="rounded-[22px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-center shadow-sm sm:px-5 sm:py-4">
                  <p className="text-sm font-semibold italic leading-6 text-slate-700 md:text-[15px] md:leading-7">
                    {config.description || 'Trân trọng giới thiệu video sản phẩm dự thi. Kính mời thầy cô và học sinh theo dõi để hiểu rõ hơn về mục tiêu, tính năng và hiệu quả ứng dụng của phần mềm.'}
                  </p>
                </div>

                <div className="mx-auto w-full max-w-[860px] overflow-hidden rounded-[22px] border border-slate-200 bg-slate-950 shadow-[0_18px_40px_rgba(15,23,42,0.2)]">
                  <div className="aspect-video w-full">
                    <iframe
                      src={`${config.embedUrl}${config.embedUrl.includes('?') ? '&' : '?'}rel=0`}
                      title={config.title2 || 'Video giới thiệu'}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                      className="h-full w-full"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-1 sm:pt-2 md:flex-row md:items-center md:justify-between">
                  <a
                    href={config.youtubeUrl || config.embedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Mở video trên YouTube
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700"
                  >
                    <PlayCircle className="h-4 w-4" />
                    {config.primaryButtonLabel || 'Tiếp tục vào ứng dụng'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
