import { useEffect, useMemo, useState } from 'react';
import { Play, PlayCircle } from 'lucide-react';
import { getYoutubeEmbedUrl } from '../utils/youtube';

export { getYoutubeEmbedUrl } from '../utils/youtube';

export default function YoutubeEmbedBlock({ url, title = 'Video bài giảng' }: { url?: string; title?: string }) {
  const embedUrl = getYoutubeEmbedUrl(url);
  const [activated, setActivated] = useState(false);
  const videoId = useMemo(() => embedUrl.match(/\/embed\/([A-Za-z0-9_-]+)/)?.[1] || '', [embedUrl]);
  useEffect(() => setActivated(false), [embedUrl]);
  if (!embedUrl) return null;
  return (
    <div className="overflow-hidden rounded-[24px] border border-red-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-red-50 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
        <PlayCircle className="h-4 w-4" /> {title}
      </div>
      <div className="aspect-video bg-slate-950">
        {activated ? (
          <iframe
            src={`${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1&rel=0`}
            title={title}
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setActivated(true)}
            className="group relative h-full w-full overflow-hidden text-white"
            aria-label={`Phát ${title}`}
          >
            {videoId ? <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-90" /> : null}
            <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/10" />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-2xl transition group-hover:scale-105"><Play className="ml-1 h-7 w-7 fill-current" /></span>
              <span className="rounded-full bg-black/55 px-4 py-2 text-sm font-bold backdrop-blur">Chạm để phát video</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
