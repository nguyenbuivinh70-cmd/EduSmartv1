export function getYoutubeEmbedUrl(url?: string) {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = parts[0] || '';
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
      if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
      else if (['embed', 'shorts', 'live'].includes(parts[0] || '')) videoId = parts[1] || '';
    }
    if (/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return `https://www.youtube.com/embed/${videoId}`;
  } catch {
    return '';
  }
  return '';
}
