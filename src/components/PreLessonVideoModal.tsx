import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Clock3, LockKeyhole, Maximize2, Minimize2, PlayCircle, RefreshCcw, ShieldCheck, TimerReset, WifiOff, X } from 'lucide-react';
import { Lesson, PreLessonProgress, User } from '../types';
import { getPreLessonProgressApi, savePreLessonProgressApi } from '../services/api';

type SyncState = 'idle' | 'loading' | 'saving' | 'saved' | 'failed' | 'retrying';

type SecondSet = Set<number>;

interface LocalPreLessonBuffer {
  lesson_id: string;
  user_id: string;
  duration_seconds: number;
  watched_seconds: number;
  watch_percent: number;
  playback_seconds: number;
  last_position_seconds: number;
  watched_ranges: string[];
  updated_at: string;
}

interface PreLessonVideoModalProps {
  isOpen: boolean;
  lesson: Lesson | null;
  user: User | null;
  onClose: () => void;
  onProgressChange?: (progress: PreLessonProgress) => void;
}

function extractYoutubeId(value?: string) {
  const url = String(value || '').trim();
  if (!url) return '';
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/i,
    /[?&]v=([A-Za-z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

function formatSeconds(value?: number) {
  const safe = Math.max(0, Math.round(Number(value || 0)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(value?: string) {
  if (!value) return 'Theo thời điểm mở bài';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function emptyProgress(lesson: Lesson, user: User): PreLessonProgress {
  return {
    progress_id: `${user.user_id}_${lesson.lesson_id}`,
    lesson_id: lesson.lesson_id,
    user_id: user.user_id,
    khoi: String(user.khoi || lesson.khoi || ''),
    lop_id: String(user.lop_id || lesson.lop_id || ''),
    video_status: 'not_started',
    duration_seconds: 0,
    watched_seconds: 0,
    watch_percent: 0,
    playback_seconds: 0,
    watched_ranges: [],
    coverage_model: 'unique_seconds_v1',
    preparation_status: 'not_started',
    schemaVersion: 4,
  };
}

function parseRanges(tokens: unknown, fallbackSeconds = 0): SecondSet {
  const result = new Set<number>();
  if (Array.isArray(tokens)) {
    tokens.forEach((token) => {
      const text = String(token || '').trim();
      const match = text.match(/^(\d+)-(\d+)$/);
      if (!match) return;
      const start = Math.max(0, Number(match[1]));
      const end = Math.max(start, Number(match[2]));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 21600) return;
      for (let second = start; second <= end; second += 1) result.add(second);
    });
  }
  // Dữ liệu V6.77.4 trở về trước chỉ có watched_seconds. Bảo toàn tiến độ cũ
  // bằng cách coi phần đã xem là một đoạn liên tục từ đầu video. Từ V6.77.5
  // trở đi mọi lần xem mới dùng độ phủ giây duy nhất nên xem lại không cộng trùng.
  if (!result.size && fallbackSeconds > 0) {
    const count = Math.max(0, Math.min(21600, Math.floor(fallbackSeconds)));
    for (let second = 0; second < count; second += 1) result.add(second);
  }
  return result;
}

function serializeRanges(seconds: SecondSet): string[] {
  const values = Array.from(seconds).filter((value) => Number.isInteger(value) && value >= 0).sort((a, b) => a - b);
  if (!values.length) return [];
  const ranges: string[] = [];
  let start = values[0];
  let end = values[0];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value <= end + 1) end = value;
    else {
      ranges.push(`${start}-${end}`);
      start = value;
      end = value;
    }
  }
  ranges.push(`${start}-${end}`);
  return ranges;
}

function mergeSecondSets(...sets: SecondSet[]) {
  const merged = new Set<number>();
  sets.forEach((set) => set.forEach((value) => merged.add(value)));
  return merged;
}

function coveredSeconds(seconds: SecondSet, duration: number) {
  if (duration <= 0) return seconds.size;
  const maxSecond = Math.max(0, Math.ceil(duration) - 1);
  let count = 0;
  seconds.forEach((value) => { if (value <= maxSecond) count += 1; });
  return Math.min(Math.ceil(duration), count);
}

function progressPercent(seconds: SecondSet, duration: number, legacyPercent = 0) {
  if (duration <= 0) return Math.max(0, Math.min(100, legacyPercent));
  const covered = coveredSeconds(seconds, duration);
  return Math.max(0, Math.min(100, Math.max(Number(legacyPercent || 0), Math.round((covered / duration) * 1000) / 10)));
}

function addViewedInterval(target: SecondSet, from: number, to: number, duration: number) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
  const safeStart = Math.max(0, Math.floor(from));
  const safeEnd = Math.max(safeStart, Math.ceil(Math.min(duration > 0 ? duration : to, to)) - 1);
  for (let second = safeStart; second <= safeEnd; second += 1) target.add(second);
}

function localBufferKey(userId: string, lessonId: string) {
  return `edusmart:prelesson:v5:${String(userId || '').trim()}:${String(lessonId || '').trim()}`;
}

function legacyLocalBufferKey(userId: string, lessonId: string) {
  return `edusmart:prelesson:v4:${String(userId || '').trim()}:${String(lessonId || '').trim()}`;
}

function readLocalBuffer(userId: string, lessonId: string): LocalPreLessonBuffer | null {
  try {
    const raw = localStorage.getItem(localBufferKey(userId, lessonId)) || localStorage.getItem(legacyLocalBufferKey(userId, lessonId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalPreLessonBuffer>;
    if (String(parsed.user_id || '') !== String(userId) || String(parsed.lesson_id || '') !== String(lessonId)) return null;
    const duration = Math.max(0, Number(parsed.duration_seconds || 0));
    const ranges = parseRanges(parsed.watched_ranges, Number(parsed.watched_seconds || 0));
    const watched = coveredSeconds(ranges, duration);
    return {
      user_id: String(userId),
      lesson_id: String(lessonId),
      duration_seconds: duration,
      watched_seconds: watched,
      watch_percent: progressPercent(ranges, duration, Number(parsed.watch_percent || 0)),
      playback_seconds: Math.max(Number(parsed.playback_seconds || 0), Number(parsed.watched_seconds || 0)),
      last_position_seconds: Math.max(0, Number(parsed.last_position_seconds || 0)),
      watched_ranges: serializeRanges(ranges),
      updated_at: String(parsed.updated_at || ''),
    };
  } catch {
    return null;
  }
}

function writeLocalBuffer(userId: string, lessonId: string, ranges: SecondSet, duration: number, playbackSeconds: number, lastPosition = 0, percentFloor = 0) {
  try {
    const watched = coveredSeconds(ranges, duration);
    const payload: LocalPreLessonBuffer = {
      user_id: String(userId),
      lesson_id: String(lessonId),
      duration_seconds: Math.max(0, Math.round(duration)),
      watched_seconds: watched,
      watch_percent: progressPercent(ranges, duration, percentFloor),
      playback_seconds: Math.max(0, Math.round(playbackSeconds)),
      last_position_seconds: Math.max(0, Math.round(lastPosition)),
      watched_ranges: serializeRanges(ranges),
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(localBufferKey(userId, lessonId), JSON.stringify(payload));
  } catch {
    // localStorage có thể bị trình duyệt chặn; playback vẫn phải tiếp tục.
  }
}

function clearLocalBuffer(userId: string, lessonId: string) {
  try {
    localStorage.removeItem(localBufferKey(userId, lessonId));
    localStorage.removeItem(legacyLocalBufferKey(userId, lessonId));
  } catch { /* no-op */ }
}

function diagnosticCode(error: unknown, fallback = 'PRELESSON_SYNC_FAILED') {
  const code = String((error as any)?.code || '').toLowerCase();
  if (code.includes('permission-denied')) return 'PRELESSON_UPDATE_DENIED';
  if (code.includes('unavailable') || code.includes('network')) return 'PRELESSON_NETWORK';
  return fallback;
}

function mergeRemoteAndLocal(remote: PreLessonProgress, buffer: LocalPreLessonBuffer | null, threshold: number): PreLessonProgress {
  const duration = Math.max(Number(remote.duration_seconds || 0), Number(buffer?.duration_seconds || 0));
  const remoteRanges = parseRanges(remote.watched_ranges, Number(remote.watched_seconds || 0));
  const localRanges = parseRanges(buffer?.watched_ranges, Number(buffer?.watched_seconds || 0));
  const mergedRanges = mergeSecondSets(remoteRanges, localRanges);
  const watched = coveredSeconds(mergedRanges, duration);
  const percent = progressPercent(mergedRanges, duration, Math.max(Number(remote.watch_percent || 0), Number(buffer?.watch_percent || 0)));
  const completed = remote.video_status === 'completed' || percent >= threshold;
  const completedBeforeDeadline = remote.completed_before_deadline === true;
  return {
    ...remote,
    watched_seconds: watched,
    duration_seconds: duration,
    watch_percent: percent,
    playback_seconds: Math.max(Number(remote.playback_seconds || 0), Number(buffer?.playback_seconds || 0), watched),
    last_position_seconds: Math.max(0, Number(buffer?.last_position_seconds ?? remote.last_position_seconds ?? 0)),
    watched_ranges: serializeRanges(mergedRanges),
    coverage_model: 'unique_seconds_v1',
    video_status: completed ? 'completed' : percent > 0 ? 'in_progress' : 'not_started',
    preparation_status: completed ? (completedBeforeDeadline ? 'prepared' : remote.completed_at ? 'late_completed' : 'in_progress') : percent > 0 ? 'in_progress' : 'not_started',
    schemaVersion: 4,
  };
}

export default function PreLessonVideoModal({ isOpen, lesson, user, onClose, onProgressChange }: PreLessonVideoModalProps) {
  const videoId = useMemo(() => extractYoutubeId(lesson?.intro_video_url || lesson?.intro_video_embed_url), [lesson?.intro_video_url, lesson?.intro_video_embed_url]);
  const trackingEnabled = lesson?.pre_lesson_enabled !== false;
  const threshold = Math.max(50, Math.min(100, Number(lesson?.pre_lesson_completion_threshold || 80)));
  const [progress, setProgress] = useState<PreLessonProgress | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [retryBusy, setRetryBusy] = useState(false);
  const [error, setError] = useState('');
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [playerPosition, setPlayerPosition] = useState(0);
  const fullscreenRootRef = useRef<HTMLDivElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const playingRef = useRef(false);
  const watchedSecondsSetRef = useRef<SecondSet>(new Set());
  const localDurationRef = useRef(0);
  const playbackSecondsRef = useRef(0);
  const lastPlayerPositionRef = useRef<number | null>(null);
  const lastWallClockRef = useRef<number | null>(null);
  const lastPositionRef = useRef(0);
  const resumePositionRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const playerReadyRef = useRef(false);
  const completedRef = useRef(false);
  const lastPersistedCoverageRef = useRef(0);
  const percentFloorRef = useRef(0);
  const persistInFlightRef = useRef(false);
  const persistAgainRef = useRef(false);
  const unmountedRef = useRef(false);
  const onProgressChangeRef = useRef(onProgressChange);

  useEffect(() => { onProgressChangeRef.current = onProgressChange; }, [onProgressChange]);

  const currentCoverageSnapshot = useCallback(() => {
    const duration = Math.max(0, localDurationRef.current);
    const watched = coveredSeconds(watchedSecondsSetRef.current, duration);
    const percent = progressPercent(watchedSecondsSetRef.current, duration, percentFloorRef.current);
    return { duration, watched, percent, ranges: serializeRanges(watchedSecondsSetRef.current), playback: playbackSecondsRef.current };
  }, []);

  const snapshotLocalBuffer = useCallback(() => {
    if (!lesson || !user || !trackingEnabled) return;
    writeLocalBuffer(user.user_id, lesson.lesson_id, watchedSecondsSetRef.current, localDurationRef.current, playbackSecondsRef.current, lastPositionRef.current, percentFloorRef.current);
  }, [lesson?.lesson_id, user?.user_id, trackingEnabled]);

  const persistProgress = useCallback(async (force = false, retry = false): Promise<boolean> => {
    if (!lesson || !user || !trackingEnabled) return true;
    const snapshot = currentCoverageSnapshot();
    if (!force && snapshot.watched - lastPersistedCoverageRef.current < 30) return true;
    snapshotLocalBuffer();
    if (persistInFlightRef.current) {
      persistAgainRef.current = true;
      return false;
    }
    persistInFlightRef.current = true;
    if (!unmountedRef.current) {
      // V6.77.6: đồng bộ nền không được làm badge chớp giữa Saved/Saving.
      // Sau khi đã có một trạng thái ổn định (saved/failed), giữ nguyên badge
      // cho tới khi request kết thúc. Retry khi đang failed cũng giữ card lỗi
      // hiện hữu thay vì ẩn/hiện liên tục.
      if (retry) setRetryBusy(true);
      else setSyncState((current) => (current === 'saved' || current === 'failed' ? current : 'saving'));
    }
    try {
      const res = await savePreLessonProgressApi(user.token, lesson.lesson_id, {
        watched_seconds: snapshot.watched,
        duration_seconds: Math.max(0, Math.round(snapshot.duration)),
        watch_percent: snapshot.percent,
        playback_seconds: Math.max(0, Math.round(snapshot.playback)),
        watched_ranges: snapshot.ranges,
        last_position_seconds: Math.max(0, Math.round(lastPositionRef.current)),
        coverage_model: 'unique_seconds_v1',
        schemaVersion: 4,
        video_status: snapshot.percent >= threshold ? 'completed' : snapshot.watched > 0 ? 'in_progress' : 'not_started',
      });
      if (res.ok && res.data) {
        const remoteRanges = parseRanges(res.data.watched_ranges, Number(res.data.watched_seconds || 0));
        watchedSecondsSetRef.current = mergeSecondSets(watchedSecondsSetRef.current, remoteRanges);
        localDurationRef.current = Math.max(localDurationRef.current, Number(res.data.duration_seconds || 0));
        playbackSecondsRef.current = Math.max(playbackSecondsRef.current, Number(res.data.playback_seconds || 0));
        const nextSnapshot = currentCoverageSnapshot();
        lastPersistedCoverageRef.current = Math.max(lastPersistedCoverageRef.current, Number(res.data.watched_seconds || 0), nextSnapshot.watched);
        percentFloorRef.current = Math.max(percentFloorRef.current, Number(res.data.watch_percent || 0));
        clearLocalBuffer(user.user_id, lesson.lesson_id);
        if (!unmountedRef.current) {
          setProgress(mergeRemoteAndLocal(res.data, {
            user_id: user.user_id,
            lesson_id: lesson.lesson_id,
            duration_seconds: nextSnapshot.duration,
            watched_seconds: nextSnapshot.watched,
            watch_percent: nextSnapshot.percent,
            playback_seconds: nextSnapshot.playback,
            watched_ranges: nextSnapshot.ranges,
            last_position_seconds: Math.max(0, Math.round(lastPositionRef.current)),
            updated_at: new Date().toISOString(),
          }, threshold));
          setError('');
          setSyncState('saved');
        }
        onProgressChangeRef.current?.(res.data);
        return true;
      }
      const diag = diagnosticCode(res.error);
      console.warn(`[PreLessonSync][${diag}]`, res.error || res.message);
      if (!unmountedRef.current) {
        setError('Tiến độ đang được giữ an toàn trên thiết bị. Em có thể tiếp tục xem; hệ thống sẽ tự đồng bộ lại khi kết nối ổn định.');
        setSyncState('failed');
      }
      return false;
    } catch (saveError) {
      const diag = diagnosticCode(saveError);
      console.warn(`[PreLessonSync][${diag}]`, saveError);
      if (!unmountedRef.current) {
        setError('Tiến độ đang được giữ an toàn trên thiết bị. Em có thể tiếp tục xem; hệ thống sẽ tự đồng bộ lại khi kết nối ổn định.');
        setSyncState('failed');
      }
      return false;
    } finally {
      persistInFlightRef.current = false;
      if (!unmountedRef.current) setRetryBusy(false);
      if (persistAgainRef.current && !unmountedRef.current) {
        persistAgainRef.current = false;
        window.setTimeout(() => { void persistProgress(true); }, 50);
      }
    }
  }, [lesson?.lesson_id, user?.user_id, user?.token, trackingEnabled, threshold, currentCoverageSnapshot, snapshotLocalBuffer]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  useEffect(() => {
    if (!isOpen || !lesson || !user) return;
    let cancelled = false;
    setError('');
    setRetryBusy(false);
    setPlayerPosition(0);
    watchedSecondsSetRef.current = new Set();
    localDurationRef.current = 0;
    playbackSecondsRef.current = 0;
    lastPlayerPositionRef.current = null;
    lastWallClockRef.current = null;
    lastPositionRef.current = 0;
    resumePositionRef.current = 0;
    resumeAppliedRef.current = false;
    playerReadyRef.current = false;
    completedRef.current = false;
    lastPersistedCoverageRef.current = 0;
    percentFloorRef.current = 0;
    const base = emptyProgress(lesson, user);
    const buffer = trackingEnabled ? readLocalBuffer(user.user_id, lesson.lesson_id) : null;
    const initial = mergeRemoteAndLocal(base, buffer, threshold);
    watchedSecondsSetRef.current = parseRanges(initial.watched_ranges, Number(initial.watched_seconds || 0));
    localDurationRef.current = Number(initial.duration_seconds || 0);
    playbackSecondsRef.current = Number(initial.playback_seconds || initial.watched_seconds || 0);
    resumePositionRef.current = Math.max(0, Number(initial.last_position_seconds || buffer?.last_position_seconds || 0));
    percentFloorRef.current = Number(initial.watch_percent || 0);
    completedRef.current = initial.video_status === 'completed' || Number(initial.watch_percent || 0) >= threshold;
    setProgress(initial);
    if (!trackingEnabled) {
      setSyncState('idle');
      return () => { cancelled = true; };
    }
    setSyncState('loading');
    void getPreLessonProgressApi(user.token, lesson.lesson_id).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        const remote = res.data || base;
        const next = mergeRemoteAndLocal(remote, buffer, threshold);
        watchedSecondsSetRef.current = parseRanges(next.watched_ranges, Number(next.watched_seconds || 0));
        localDurationRef.current = Number(next.duration_seconds || 0);
        playbackSecondsRef.current = Number(next.playback_seconds || next.watched_seconds || 0);
        resumePositionRef.current = Math.max(resumePositionRef.current, Number(next.last_position_seconds || 0));
        lastPersistedCoverageRef.current = Number(remote.watched_seconds || 0);
        percentFloorRef.current = Math.max(percentFloorRef.current, Number(next.watch_percent || 0));
        completedRef.current = next.video_status === 'completed' || Number(next.watch_percent || 0) >= threshold;
        setProgress(next);
        if (playerReadyRef.current && !resumeAppliedRef.current && !playingRef.current && next.video_status !== 'completed') {
          const resumeAt = Math.max(0, Number(next.last_position_seconds || 0));
          const duration = Math.max(0, Number(playerRef.current?.getDuration?.() || next.duration_seconds || 0));
          if (resumeAt >= 5 && (!duration || resumeAt < duration - 3)) {
            try { playerRef.current?.seekTo?.(resumeAt, true); } catch { /* no-op */ }
            resumeAppliedRef.current = true;
            lastPositionRef.current = resumeAt;
            setPlayerPosition(resumeAt);
          }
        }
        const localAhead = Number(buffer?.watched_seconds || 0) > Number(remote.watched_seconds || 0)
          || (buffer?.watched_ranges?.length || 0) > (remote.watched_ranges?.length || 0);
        setSyncState(localAhead ? 'saving' : 'saved');
        if (localAhead) window.setTimeout(() => void persistProgress(true), 0);
      } else {
        const diag = diagnosticCode(res.error, 'PRELESSON_LOAD_DENIED');
        console.warn(`[PreLessonSync][${diag}]`, res.error || res.message);
        setProgress(initial);
        setError('Tiến độ đang được giữ an toàn trên thiết bị. Em có thể tiếp tục xem; hệ thống sẽ tự đồng bộ lại khi kết nối ổn định.');
        setSyncState('failed');
      }
    });
    return () => { cancelled = true; snapshotLocalBuffer(); };
  }, [isOpen, lesson?.lesson_id, user?.user_id, user?.token, trackingEnabled, threshold, persistProgress, snapshotLocalBuffer]);

  const samplePlayerCoverage = useCallback(() => {
    if (!playerRef.current) return;
    const current = Number(playerRef.current?.getCurrentTime?.() || 0);
    const duration = Number(playerRef.current?.getDuration?.() || 0);
    if (duration > 0) localDurationRef.current = Math.max(localDurationRef.current, duration);
    setPlayerPosition(Math.max(0, current));
    lastPositionRef.current = Math.max(0, current);
    const now = performance.now();
    const previousPosition = lastPlayerPositionRef.current;
    const previousWall = lastWallClockRef.current;
    if (playingRef.current && document.visibilityState === 'visible' && previousPosition != null && previousWall != null) {
      const wallDelta = Math.max(0, Math.min(2.5, (now - previousWall) / 1000));
      const positionDelta = current - previousPosition;
      playbackSecondsRef.current += wallDelta;
      // Chỉ cộng độ phủ khi player thực sự chạy liền mạch. Nhảy/tua lớn không
      // làm tăng tiến độ; xem lại đoạn cũ cũng không cộng vì Set loại trùng.
      const maxNaturalDelta = Math.max(3.2, wallDelta * 3.25);
      if (positionDelta > 0 && positionDelta <= maxNaturalDelta) {
        addViewedInterval(watchedSecondsSetRef.current, previousPosition, current, localDurationRef.current);
      }
    }
    lastPlayerPositionRef.current = current;
    lastWallClockRef.current = now;
  }, []);

  useEffect(() => {
    if (!isOpen || !videoId || !playerHostRef.current) return;
    let disposed = false;
    let retryTimer = 0;
    const initPlayer = () => {
      if (disposed || !playerHostRef.current) return;
      const YT = (window as any).YT;
      if (!YT?.Player) {
        retryTimer = window.setTimeout(initPlayer, 250);
        return;
      }
      try { playerRef.current?.destroy?.(); } catch { /* no-op */ }
      playerRef.current = new YT.Player(playerHostRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (event: any) => {
            const duration = Number(event?.target?.getDuration?.() || 0);
            if (duration > 0) localDurationRef.current = Math.max(localDurationRef.current, duration);
            playerReadyRef.current = true;
            const resumeAt = Math.max(0, Number(resumePositionRef.current || 0));
            if (!resumeAppliedRef.current && !completedRef.current && resumeAt >= 5 && (!duration || resumeAt < duration - 3)) {
              try { event?.target?.seekTo?.(resumeAt, true); } catch { /* no-op */ }
              resumeAppliedRef.current = true;
              lastPositionRef.current = resumeAt;
            }
            lastPlayerPositionRef.current = Number(event?.target?.getCurrentTime?.() || resumeAt || 0);
            lastWallClockRef.current = performance.now();
          },
          onStateChange: (event: any) => {
            samplePlayerCoverage();
            playingRef.current = event?.data === 1;
            lastPlayerPositionRef.current = Number(event?.target?.getCurrentTime?.() || 0);
            lastWallClockRef.current = performance.now();
            const duration = Number(event?.target?.getDuration?.() || 0);
            if (duration > 0) localDurationRef.current = Math.max(localDurationRef.current, duration);
            if (event?.data === 0 || event?.data === 2) {
              snapshotLocalBuffer();
              void persistProgress(true);
            }
          },
        },
      });
    };
    const w = window as any;
    if (!w.YT?.Player) {
      const existing = document.querySelector<HTMLScriptElement>('script[data-edusmart-youtube-api="1"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.edusmartYoutubeApi = '1';
        document.head.appendChild(script);
      }
    }
    initPlayer();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      samplePlayerCoverage();
      playingRef.current = false;
      snapshotLocalBuffer();
      void persistProgress(true);
      try { playerRef.current?.destroy?.(); } catch { /* no-op */ }
      playerRef.current = null;
    };
  }, [isOpen, videoId, lesson?.lesson_id, persistProgress, snapshotLocalBuffer, samplePlayerCoverage]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      samplePlayerCoverage();
      if (!playingRef.current || document.visibilityState !== 'visible' || !trackingEnabled) return;
      const snapshot = currentCoverageSnapshot();
      if (snapshot.percent >= threshold) completedRef.current = true;
      setProgress((current) => current ? {
        ...current,
        watched_seconds: snapshot.watched,
        duration_seconds: Math.round(snapshot.duration),
        watch_percent: snapshot.percent,
        playback_seconds: Math.round(snapshot.playback),
        last_position_seconds: Math.max(0, Math.round(lastPositionRef.current)),
        watched_ranges: snapshot.ranges,
        coverage_model: 'unique_seconds_v1',
        video_status: snapshot.percent >= threshold ? 'completed' : snapshot.watched > 0 ? 'in_progress' : 'not_started',
        preparation_status: snapshot.percent >= threshold ? current.preparation_status || 'in_progress' : snapshot.watched > 0 ? 'in_progress' : 'not_started',
        schemaVersion: 4,
      } : current);
      if (snapshot.watched % 5 === 0) snapshotLocalBuffer();
      void persistProgress(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, trackingEnabled, threshold, persistProgress, snapshotLocalBuffer, samplePlayerCoverage, currentCoverageSnapshot]);

  useEffect(() => {
    if (!isOpen) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        samplePlayerCoverage();
        snapshotLocalBuffer();
        void persistProgress(true);
      } else {
        lastPlayerPositionRef.current = Number(playerRef.current?.getCurrentTime?.() || 0);
        lastWallClockRef.current = performance.now();
      }
    };
    const onPageHide = () => {
      samplePlayerCoverage();
      snapshotLocalBuffer();
      void persistProgress(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [isOpen, persistProgress, snapshotLocalBuffer, samplePlayerCoverage]);

  useEffect(() => {
    if (!isOpen || !trackingEnabled || syncState !== 'failed') return;
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void persistProgress(true, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [isOpen, trackingEnabled, syncState, persistProgress]);

  const toggleBrowserFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (fullscreenRootRef.current?.requestFullscreen) await fullscreenRootRef.current.requestFullscreen();
    } catch { /* modal vẫn chiếm 100dvh */ }
  }, []);

  const toggleVideoFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === videoFrameRef.current) await document.exitFullscreen();
      else if (videoFrameRef.current?.requestFullscreen) await videoFrameRef.current.requestFullscreen();
    } catch { /* mobile browser có thể không hỗ trợ */ }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setBrowserFullscreen(Boolean(document.fullscreenElement));
      setVideoFullscreen(document.fullscreenElement === videoFrameRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  if (!lesson || !user) return null;
  const percent = Math.max(0, Math.min(100, Number(progress?.watch_percent || 0)));
  const completed = progress?.video_status === 'completed' || percent >= threshold;
  const deadlineValue = lesson.pre_lesson_deadline || lesson.thoi_gian_bat_dau;
  const deadlineMs = deadlineValue ? new Date(deadlineValue).getTime() : NaN;
  const isBeforeDeadlineNow = Number.isNaN(deadlineMs) || Date.now() <= deadlineMs;
  const preparedOnTime = completed && (progress?.completed_at ? progress.completed_before_deadline !== false : isBeforeDeadlineNow);
  const completedLate = completed && !preparedOnTime;
  const readinessLabel = preparedOnTime ? 'Có chuẩn bị bài' : completedLate ? 'Đã xem đủ • Hoàn thành muộn' : percent > 0 ? `Đang chuẩn bị • ${Math.round(percent)}%` : 'Chưa chuẩn bị bài';
  const syncLabel = !trackingEnabled ? 'Chế độ xem video một mình'
    : syncState === 'loading' ? 'Đang tải tiến độ...'
      : syncState === 'saving' ? 'Đang đồng bộ lần đầu...'
        : syncState === 'failed' ? 'Chưa đồng bộ được tiến độ'
          : 'Đã lưu tiến độ';

  const handleClose = async () => {
    samplePlayerCoverage();
    snapshotLocalBuffer();
    if (trackingEnabled) await persistProgress(true);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div ref={fullscreenRootRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[13000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950 text-white">
          <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-white/10 bg-slate-950/95 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-200 ring-1 ring-indigo-300/15 sm:text-[11px]"><PlayCircle className="h-3.5 w-3.5" /> {trackingEnabled ? 'Nhiệm vụ chuẩn bị trước bài' : 'Video xem trước bài học'}</span>
                <span className="hidden rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10 sm:inline-flex">Học một mình</span>
              </div>
              <h2 className="mt-1.5 truncate text-base font-black text-white sm:text-xl">{lesson.tieu_de}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => void toggleBrowserFullscreen()} className="hidden h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white ring-1 ring-white/10 hover:bg-white/15 sm:inline-flex" title="Bật/tắt toàn màn hình học tập">{browserFullscreen && !videoFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} <span className="hidden lg:inline">{browserFullscreen && !videoFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}</span></button>
              <button type="button" onClick={() => { void handleClose(); }} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-slate-100 ring-1 ring-white/10 hover:bg-rose-500/80" aria-label="Đóng video trước bài"><X className="h-5 w-5" /></button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 lg:grid lg:grid-cols-[minmax(0,1fr)_310px] lg:overflow-hidden">
            <main className="flex min-h-0 flex-col bg-slate-950 lg:overflow-hidden">
              <div className="flex min-h-0 flex-1 items-center justify-center bg-black lg:p-3 xl:p-5">
                {videoId ? (
                  <div ref={videoFrameRef} className="relative aspect-video w-full overflow-hidden bg-black shadow-2xl lg:h-full lg:max-h-full lg:aspect-auto lg:rounded-2xl lg:ring-1 lg:ring-white/10">
                    <div ref={playerHostRef} className="h-full w-full" />
                    {trackingEnabled ? <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur sm:left-3 sm:top-3 sm:text-xs">Độ phủ {Math.round(percent)}% • {formatSeconds(progress?.watched_seconds)} nội dung</div> : null}
                    <button type="button" onClick={() => void toggleVideoFullscreen()} className="absolute bottom-3 right-3 z-20 inline-flex h-9 items-center gap-1.5 rounded-lg bg-black/60 px-2.5 text-[11px] font-bold text-white backdrop-blur hover:bg-black/80" title="Phóng to riêng video">{videoFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} <span className="hidden sm:inline">{videoFullscreen ? 'Thu nhỏ' : 'Phóng to video'}</span></button>
                  </div>
                ) : <div className="m-4 flex aspect-video w-full max-w-5xl items-center justify-center rounded-2xl bg-slate-900 p-8 text-center text-sm font-semibold text-slate-300 ring-1 ring-white/10">Liên kết video hiện tại không phải URL YouTube hợp lệ. Giáo viên cần cập nhật lại video chuẩn bị.</div>}
              </div>
              <div className="hidden shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-slate-950 px-5 py-3 text-xs text-slate-300 lg:flex"><span>Tiến độ tính theo phần nội dung thực sự đã xem. Tua qua không được tính; xem lại đoạn cũ không cộng trùng.</span><span className="inline-flex items-center gap-2 text-slate-400"><LockKeyhole className="h-4 w-4" /> Nội dung bài học vẫn được khóa</span></div>
            </main>

            <aside className="bg-white text-slate-700 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-slate-200">
              <div className="space-y-3 p-3 sm:p-4 lg:p-4">
                {trackingEnabled ? <section className={`rounded-2xl p-4 ring-1 ${preparedOnTime ? 'bg-emerald-50 text-emerald-800 ring-emerald-100' : completedLate ? 'bg-amber-50 text-amber-800 ring-amber-100' : 'bg-indigo-50 text-indigo-800 ring-indigo-100'}`}>
                  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-black">{completed ? <CheckCircle2 className="h-5 w-5" /> : <TimerReset className="h-5 w-5" />} {completed ? 'Đã xem đủ video' : 'Tiến độ xem'}</div><strong className="text-2xl font-black tabular-nums">{Math.round(percent)}%</strong></div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/90"><div className={`h-full rounded-full transition-all ${preparedOnTime ? 'bg-emerald-500' : completedLate ? 'bg-amber-500' : 'bg-indigo-600'}`} style={{ width: `${percent}%` }} /></div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold"><span>{formatSeconds(progress?.watched_seconds)} / {progress?.duration_seconds ? formatSeconds(progress.duration_seconds) : '...'} nội dung</span><span className="text-right">Cần {threshold}%</span></div>
                  <div className="mt-2 border-t border-current/10 pt-2 text-[11px] opacity-80">Vị trí video hiện tại: <strong>{formatSeconds(playerPosition)}</strong>. Xem lại đoạn đã xem không làm tăng %.</div>
                </section> : <section className="rounded-2xl bg-fuchsia-50 p-4 text-fuchsia-800 ring-1 ring-fuchsia-100"><div className="flex items-center gap-2 font-black"><PlayCircle className="h-5 w-5" /> Xem trước video</div><p className="mt-2 text-sm leading-6">Phiên xem này không ghi nhận tiến độ chuẩn bị bài.</p></section>}

                {trackingEnabled ? <section className="rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3 py-2"><span className="text-slate-500">Hạn hoàn thành</span><strong className="text-right text-xs text-slate-900">{formatDateTime(deadlineValue)}</strong></div>
                  <div className="border-t border-slate-100 py-2"><span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">Đánh giá chuẩn bị</span><strong className={`mt-1 block ${preparedOnTime ? 'text-emerald-700' : completedLate ? 'text-amber-700' : percent > 0 ? 'text-indigo-700' : 'text-slate-700'}`}>{readinessLabel}</strong>{completed && !progress?.completed_at ? <span className="mt-1 block text-[11px] text-slate-500">Đã đạt ngưỡng trên thiết bị; trạng thái chính thức sẽ được chốt sau khi đồng bộ.</span> : null}</div>
                </section> : null}

                <section className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-100"><p className="flex items-center gap-2 font-black"><LockKeyhole className="h-4 w-4" /> Chỉ mở video trước bài</p><p className="mt-1">Hoạt động học và học cùng vẫn bị khóa cho đến khi giáo viên mở bài.</p></section>

                <div className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ring-1 ${syncState === 'failed' ? 'bg-rose-50 text-rose-700 ring-rose-100' : syncState === 'saved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-50 text-slate-500 ring-slate-100'}`}>{syncState === 'failed' ? <WifiOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />} {syncLabel}</div>
                {syncState === 'failed' && error ? <div className="rounded-2xl bg-rose-50 p-3 text-xs leading-5 text-rose-700 ring-1 ring-rose-100"><p className="font-bold">Chưa thể đồng bộ tiến độ.</p><p className="mt-1">{error}</p><button type="button" disabled={retryBusy} onClick={() => { void persistProgress(true, true); }} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-70"><RefreshCcw className={`h-3.5 w-3.5 ${retryBusy ? 'animate-spin' : ''}`} /> {retryBusy ? 'Đang thử lại...' : 'Thử lại'}</button></div> : null}

                <details className="rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-100 lg:hidden"><summary className="cursor-pointer font-black text-slate-800">Cách tính tiến độ</summary><p className="mt-2">Tiến độ dựa trên độ phủ nội dung video. Tua qua không tính; xem lại cùng một đoạn không cộng thêm. Nếu mạng gián đoạn, tiến độ được giữ trên thiết bị và tự đồng bộ lại.</p></details>
              </div>
            </aside>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
