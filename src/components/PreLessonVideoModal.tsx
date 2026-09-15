import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Maximize2,
  Minimize2,
  PlayCircle,
  Send,
  ShieldCheck,
  TimerReset,
  WifiOff,
  X,
} from 'lucide-react';
import { Lesson, PreLessonProgress, PreLessonSubmission, User } from '../types';
import { getPreLessonSubmissionApi, submitPreLessonPreparationApi } from '../services/api';

type SecondSet = Set<number>;
type SubmissionState = 'idle' | 'loading' | 'ready' | 'submitting' | 'submitted' | 'failed';

interface LocalPreLessonBuffer {
  lesson_id: string;
  user_id: string;
  video_revision: number;
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
  if (!value) return 'Không giới hạn';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
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

function bufferKey(userId: string, lessonId: string, revision: number) {
  return `edusmart:prelesson:v6:${String(userId || '').trim()}:${String(lessonId || '').trim()}:r${revision}`;
}

function legacyBufferKeys(userId: string, lessonId: string) {
  return [
    `edusmart:prelesson:v5:${String(userId || '').trim()}:${String(lessonId || '').trim()}`,
    `edusmart:prelesson:v4:${String(userId || '').trim()}:${String(lessonId || '').trim()}`,
  ];
}

function readLocalBuffer(userId: string, lessonId: string, revision: number): LocalPreLessonBuffer | null {
  try {
    const primary = localStorage.getItem(bufferKey(userId, lessonId, revision));
    // Chỉ nhập buffer V4/V5 cho revision đầu tiên; khi giáo viên thay video,
    // revision tăng nên tuyệt đối không mang tiến độ video cũ sang video mới.
    const legacy = revision === 1
      ? legacyBufferKeys(userId, lessonId).map((key) => localStorage.getItem(key)).find(Boolean)
      : null;
    const raw = primary || legacy;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalPreLessonBuffer>;
    if (String(parsed.user_id || '') !== String(userId) || String(parsed.lesson_id || '') !== String(lessonId)) return null;
    if (parsed.video_revision && Number(parsed.video_revision) !== revision) return null;
    const duration = Math.max(0, Number(parsed.duration_seconds || 0));
    const ranges = parseRanges(parsed.watched_ranges, Number(parsed.watched_seconds || 0));
    const watched = coveredSeconds(ranges, duration);
    return {
      user_id: String(userId),
      lesson_id: String(lessonId),
      video_revision: revision,
      duration_seconds: duration,
      watched_seconds: watched,
      watch_percent: progressPercent(ranges, duration, Number(parsed.watch_percent || 0)),
      playback_seconds: Math.max(Number(parsed.playback_seconds || 0), watched),
      last_position_seconds: Math.max(0, Number(parsed.last_position_seconds || 0)),
      watched_ranges: serializeRanges(ranges),
      updated_at: String(parsed.updated_at || ''),
    };
  } catch {
    return null;
  }
}

function writeLocalBuffer(userId: string, lessonId: string, revision: number, ranges: SecondSet, duration: number, playbackSeconds: number, lastPosition = 0) {
  try {
    const watched = coveredSeconds(ranges, duration);
    const payload: LocalPreLessonBuffer = {
      user_id: String(userId),
      lesson_id: String(lessonId),
      video_revision: revision,
      duration_seconds: Math.max(0, Math.round(duration)),
      watched_seconds: watched,
      watch_percent: progressPercent(ranges, duration),
      playback_seconds: Math.max(0, Math.round(playbackSeconds)),
      last_position_seconds: Math.max(0, Math.round(lastPosition)),
      watched_ranges: serializeRanges(ranges),
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(bufferKey(userId, lessonId, revision), JSON.stringify(payload));
  } catch {
    // Trình duyệt có thể chặn localStorage. Video vẫn tiếp tục phát nhưng trạng thái
    // chưa gửi có thể không khôi phục sau khi đóng tab.
  }
}

function clearLocalBuffer(userId: string, lessonId: string, revision: number) {
  try {
    localStorage.removeItem(bufferKey(userId, lessonId, revision));
    if (revision === 1) legacyBufferKeys(userId, lessonId).forEach((key) => localStorage.removeItem(key));
  } catch { /* no-op */ }
}

function diagnosticCode(error: unknown, fallback: string) {
  const explicit = String((error as any)?.diagnosticCode || '').trim();
  if (explicit) return explicit;
  const code = String((error as any)?.code || '').toLowerCase();
  if (code.includes('permission-denied')) return fallback;
  if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) return 'PRELESSON_NETWORK';
  return fallback;
}

function progressFromLocal(lesson: Lesson, user: User, buffer: LocalPreLessonBuffer | null): PreLessonProgress {
  const duration = Math.max(0, Number(buffer?.duration_seconds || 0));
  const ranges = parseRanges(buffer?.watched_ranges, Number(buffer?.watched_seconds || 0));
  const watched = coveredSeconds(ranges, duration);
  const percent = progressPercent(ranges, duration, Number(buffer?.watch_percent || 0));
  return {
    progress_id: `${user.user_id}_${lesson.lesson_id}`,
    lesson_id: lesson.lesson_id,
    user_id: user.user_id,
    khoi: String(user.khoi || lesson.khoi || ''),
    lop_id: String(user.lop_id || lesson.lop_id || ''),
    video_status: percent > 0 ? 'in_progress' : 'not_started',
    duration_seconds: duration,
    watched_seconds: watched,
    watch_percent: percent,
    playback_seconds: Number(buffer?.playback_seconds || watched),
    last_position_seconds: Number(buffer?.last_position_seconds || 0),
    watched_ranges: serializeRanges(ranges),
    coverage_model: 'unique_seconds_v1',
    preparation_status: percent > 0 ? 'in_progress' : 'not_started',
    schemaVersion: 6,
  };
}

function progressFromSubmission(lesson: Lesson, user: User, submission: PreLessonSubmission): PreLessonProgress {
  return {
    progress_id: submission.submission_id,
    lesson_id: lesson.lesson_id,
    user_id: user.user_id,
    ownerUid: submission.ownerUid,
    khoi: submission.khoi || String(user.khoi || lesson.khoi || ''),
    lop_id: submission.lop_id || String(user.lop_id || lesson.lop_id || ''),
    video_status: 'completed',
    duration_seconds: Number(submission.duration_seconds || 0),
    watched_seconds: Number(submission.watched_seconds || 0),
    watch_percent: Number(submission.watch_percent || 0),
    playback_seconds: Number(submission.watched_seconds || 0),
    watched_ranges: [],
    coverage_model: 'unique_seconds_v1',
    preparation_status: submission.preparation_status,
    completed_at: submission.submitted_at,
    completed_before_deadline: submission.completed_before_deadline === true,
    updated_at: submission.submitted_at,
    schemaVersion: 6,
  };
}

export default function PreLessonVideoModal({ isOpen, lesson, user, onClose, onProgressChange }: PreLessonVideoModalProps) {
  const videoId = useMemo(() => extractYoutubeId(lesson?.intro_video_url || lesson?.intro_video_embed_url), [lesson?.intro_video_url, lesson?.intro_video_embed_url]);
  const trackingEnabled = lesson?.pre_lesson_enabled !== false;
  const threshold = Math.max(50, Math.min(100, Number(lesson?.pre_lesson_completion_threshold || 80)));
  const videoRevision = Math.max(1, Math.floor(Number(lesson?.pre_lesson_video_revision || 1)));
  const [progress, setProgress] = useState<PreLessonProgress | null>(null);
  const [submission, setSubmission] = useState<PreLessonSubmission | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
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
  const submittedRef = useRef(false);
  const onProgressChangeRef = useRef(onProgressChange);

  useEffect(() => { onProgressChangeRef.current = onProgressChange; }, [onProgressChange]);

  const currentCoverageSnapshot = useCallback(() => {
    const duration = Math.max(0, localDurationRef.current);
    const watched = coveredSeconds(watchedSecondsSetRef.current, duration);
    const percent = progressPercent(watchedSecondsSetRef.current, duration);
    return {
      duration,
      watched,
      percent,
      ranges: serializeRanges(watchedSecondsSetRef.current),
      playback: playbackSecondsRef.current,
      lastPosition: lastPositionRef.current,
    };
  }, []);

  const snapshotLocalBuffer = useCallback(() => {
    if (!lesson || !user || !trackingEnabled || submittedRef.current) return;
    writeLocalBuffer(
      user.user_id,
      lesson.lesson_id,
      videoRevision,
      watchedSecondsSetRef.current,
      localDurationRef.current,
      playbackSecondsRef.current,
      lastPositionRef.current,
    );
  }, [lesson?.lesson_id, user?.user_id, trackingEnabled, videoRevision]);

  useEffect(() => {
    if (!isOpen || !lesson || !user) return;
    let cancelled = false;
    const buffer = trackingEnabled ? readLocalBuffer(user.user_id, lesson.lesson_id, videoRevision) : null;
    const initial = progressFromLocal(lesson, user, buffer);
    watchedSecondsSetRef.current = parseRanges(initial.watched_ranges, initial.watched_seconds);
    localDurationRef.current = Number(initial.duration_seconds || 0);
    playbackSecondsRef.current = Number(initial.playback_seconds || initial.watched_seconds || 0);
    lastPositionRef.current = Number(initial.last_position_seconds || 0);
    resumePositionRef.current = lastPositionRef.current;
    resumeAppliedRef.current = false;
    submittedRef.current = false;
    setProgress(initial);
    setSubmission(null);
    setError('');
    setPlayerPosition(0);
    setSubmissionState(trackingEnabled ? 'loading' : 'idle');

    if (!trackingEnabled) return () => { cancelled = true; };

    void getPreLessonSubmissionApi(user.token, lesson.lesson_id).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        const current = res.data;
        const sameRevision = Boolean(current
          && Number(current.video_revision || 1) === videoRevision
          && (!videoId || !current.video_id || current.video_id === videoId));
        if (sameRevision && current) {
          submittedRef.current = true;
          setSubmission(current);
          const official = progressFromSubmission(lesson, user, current);
          setProgress(official);
          clearLocalBuffer(user.user_id, lesson.lesson_id, videoRevision);
          setSubmissionState('submitted');
          onProgressChangeRef.current?.(official);
        } else {
          setSubmissionState('ready');
        }
      } else {
        const diag = diagnosticCode(res.error, 'PRELESSON_SUBMISSION_LOAD_DENIED');
        setError(`Không tải được trạng thái đã gửi (${diag}). Tiến độ xem vẫn được giữ trên thiết bị; em có thể tiếp tục xem và thử gửi khi đủ điều kiện.`);
        setSubmissionState('failed');
      }
    });

    return () => {
      cancelled = true;
      snapshotLocalBuffer();
    };
  }, [isOpen, lesson?.lesson_id, user?.user_id, user?.token, trackingEnabled, videoRevision, videoId, snapshotLocalBuffer]);

  const samplePlayerCoverage = useCallback(() => {
    if (!playerRef.current || submittedRef.current) return;
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
            const resumeAt = submittedRef.current ? 0 : Math.max(0, Number(resumePositionRef.current || 0));
            if (!resumeAppliedRef.current && resumeAt >= 5 && (!duration || resumeAt < duration - 3)) {
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
            if (event?.data === 0 || event?.data === 2) snapshotLocalBuffer();
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
      try { playerRef.current?.destroy?.(); } catch { /* no-op */ }
      playerRef.current = null;
    };
  }, [isOpen, videoId, lesson?.lesson_id, samplePlayerCoverage, snapshotLocalBuffer]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      samplePlayerCoverage();
      if (!trackingEnabled || submittedRef.current) return;
      const snapshot = currentCoverageSnapshot();
      setProgress((current) => current ? {
        ...current,
        watched_seconds: snapshot.watched,
        duration_seconds: Math.round(snapshot.duration),
        watch_percent: snapshot.percent,
        playback_seconds: Math.round(snapshot.playback),
        last_position_seconds: Math.max(0, Math.round(snapshot.lastPosition)),
        watched_ranges: snapshot.ranges,
        coverage_model: 'unique_seconds_v1',
        video_status: snapshot.percent >= threshold ? 'completed' : snapshot.watched > 0 ? 'in_progress' : 'not_started',
        preparation_status: snapshot.watched > 0 ? 'in_progress' : 'not_started',
        schemaVersion: 6,
      } : current);
      // Local checkpoint mỗi 5 giây phủ mới; không ghi Firestore trong khi xem.
      if (snapshot.watched > 0 && snapshot.watched % 5 === 0) snapshotLocalBuffer();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, trackingEnabled, threshold, samplePlayerCoverage, currentCoverageSnapshot, snapshotLocalBuffer]);

  useEffect(() => {
    if (!isOpen) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        samplePlayerCoverage();
        snapshotLocalBuffer();
      } else {
        lastPlayerPositionRef.current = Number(playerRef.current?.getCurrentTime?.() || 0);
        lastWallClockRef.current = performance.now();
      }
    };
    const onPageHide = () => {
      samplePlayerCoverage();
      snapshotLocalBuffer();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [isOpen, samplePlayerCoverage, snapshotLocalBuffer]);

  const handleSubmitPreparation = useCallback(async () => {
    if (!lesson || !user || !trackingEnabled || submittedRef.current) return;
    samplePlayerCoverage();
    snapshotLocalBuffer();
    const snapshot = currentCoverageSnapshot();
    if (snapshot.duration <= 0 || snapshot.percent + 0.001 < threshold) {
      setError(`Em cần xem đủ ít nhất ${threshold}% nội dung video trước khi gửi kết quả chuẩn bị bài.`);
      return;
    }
    setError('');
    setSubmissionState('submitting');
    const res = await submitPreLessonPreparationApi(user.token, lesson.lesson_id, {
      watch_percent: snapshot.percent,
      watched_seconds: snapshot.watched,
      duration_seconds: Math.round(snapshot.duration),
    });
    if (res.ok && res.data) {
      submittedRef.current = true;
      setSubmission(res.data);
      const official = progressFromSubmission(lesson, user, res.data);
      setProgress(official);
      clearLocalBuffer(user.user_id, lesson.lesson_id, videoRevision);
      setSubmissionState('submitted');
      setError('');
      onProgressChangeRef.current?.(official);
      return;
    }
    const diag = diagnosticCode(res.error, 'PRELESSON_SUBMIT_DENIED');
    setError(diag === 'PRELESSON_SUBMIT_DENIED'
      ? 'Firestore từ chối ghi kết quả chuẩn bị bài. Hãy xác minh Firestore Rules hiện hành đã được deploy. Hệ thống dùng submission tối giản theo từng bài; tiến độ xem vẫn được giữ an toàn trên thiết bị rồi bấm Thử gửi lại.'
      : `Chưa gửi được kết quả chuẩn bị bài (${diag}). Tiến độ vẫn được lưu an toàn trên thiết bị. Hãy kiểm tra mạng rồi bấm gửi lại.`);
    setSubmissionState('failed');
  }, [lesson, user, trackingEnabled, threshold, videoRevision, samplePlayerCoverage, snapshotLocalBuffer, currentCoverageSnapshot]);

  const toggleBrowserFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (fullscreenRootRef.current?.requestFullscreen) await fullscreenRootRef.current.requestFullscreen();
    } catch { /* modal vẫn hoạt động */ }
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
  const eligibleToSubmit = trackingEnabled && !submission && Number(progress?.duration_seconds || 0) > 0 && percent + 0.001 >= threshold;
  const deadlineValue = lesson.pre_lesson_deadline || lesson.thoi_gian_bat_dau;
  const submittedOnTime = submission?.preparation_status === 'prepared';
  const submittedLate = submission?.preparation_status === 'late_completed';
  const remainingPercent = Math.max(0, Math.ceil((threshold - percent) * 10) / 10);

  const readinessLabel = submission
    ? (submittedOnTime ? 'Đã chuẩn bị bài' : 'Đã gửi • Hoàn thành muộn')
    : eligibleToSubmit
      ? 'Đã xem đủ • Chưa gửi kết quả'
      : percent > 0
        ? `Đang xem • ${Math.round(percent)}%`
        : 'Chưa xem video';

  const handleClose = () => {
    samplePlayerCoverage();
    snapshotLocalBuffer();
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
                <span className="hidden rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10 sm:inline-flex">Cá nhân</span>
              </div>
              <h2 className="mt-1.5 truncate text-base font-black text-white sm:text-xl">{lesson.tieu_de}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => void toggleBrowserFullscreen()} className="hidden h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white ring-1 ring-white/10 hover:bg-white/15 sm:inline-flex" title="Bật/tắt toàn màn hình học tập">{browserFullscreen && !videoFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} <span className="hidden lg:inline">{browserFullscreen && !videoFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}</span></button>
              <button type="button" onClick={handleClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-slate-100 ring-1 ring-white/10 hover:bg-rose-500/80" aria-label="Đóng video trước bài"><X className="h-5 w-5" /></button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:overflow-hidden">
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
              <div className="hidden shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-slate-950 px-5 py-3 text-xs text-slate-300 lg:flex"><span>Tiến độ chỉ lưu trên thiết bị cho tới khi em bấm Gửi kết quả. Tua qua không tính; xem lại đoạn cũ không cộng trùng.</span><span className="inline-flex items-center gap-2 text-slate-400"><LockKeyhole className="h-4 w-4" /> Nội dung bài học vẫn được khóa</span></div>
            </main>

            <aside className="bg-white text-slate-700 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-slate-200">
              <div className="space-y-3 p-3 sm:p-4 lg:p-4">
                {trackingEnabled ? <section className={`rounded-2xl p-4 ring-1 ${submission ? (submittedOnTime ? 'bg-emerald-50 text-emerald-800 ring-emerald-100' : 'bg-amber-50 text-amber-800 ring-amber-100') : eligibleToSubmit ? 'bg-cyan-50 text-cyan-800 ring-cyan-100' : 'bg-indigo-50 text-indigo-800 ring-indigo-100'}`}>
                  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-black">{submission ? <CheckCircle2 className="h-5 w-5" /> : eligibleToSubmit ? <ShieldCheck className="h-5 w-5" /> : <TimerReset className="h-5 w-5" />} {submission ? 'Đã gửi kết quả' : eligibleToSubmit ? 'Đã đủ điều kiện' : 'Tiến độ xem'}</div><strong className="text-2xl font-black tabular-nums">{Math.round(percent)}%</strong></div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/90"><div className={`h-full rounded-full transition-all ${submission ? (submittedOnTime ? 'bg-emerald-500' : 'bg-amber-500') : eligibleToSubmit ? 'bg-cyan-500' : 'bg-indigo-600'}`} style={{ width: `${percent}%` }} /></div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold"><span>{formatSeconds(progress?.watched_seconds)} / {progress?.duration_seconds ? formatSeconds(progress.duration_seconds) : '...'} nội dung</span><span className="text-right">Cần {threshold}%</span></div>
                  <div className="mt-2 border-t border-current/10 pt-2 text-[11px] opacity-80">Vị trí hiện tại: <strong>{formatSeconds(playerPosition)}</strong>. Xem lại đoạn đã xem không làm tăng %.</div>
                </section> : <section className="rounded-2xl bg-fuchsia-50 p-4 text-fuchsia-800 ring-1 ring-fuchsia-100"><div className="flex items-center gap-2 font-black"><PlayCircle className="h-5 w-5" /> Xem trước video</div><p className="mt-2 text-sm leading-6">Phiên xem này không phải nhiệm vụ chuẩn bị bài.</p></section>}

                {trackingEnabled ? <section className="rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3 py-2"><span className="text-slate-500">Hạn gửi</span><strong className="text-right text-xs text-slate-900">{formatDateTime(deadlineValue)}</strong></div>
                  <div className="border-t border-slate-100 py-2"><span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">Trạng thái chuẩn bị</span><strong className={`mt-1 block ${submission ? (submittedOnTime ? 'text-emerald-700' : 'text-amber-700') : eligibleToSubmit ? 'text-cyan-700' : percent > 0 ? 'text-indigo-700' : 'text-slate-700'}`}>{readinessLabel}</strong>{!submission && !eligibleToSubmit ? <span className="mt-1 block text-[11px] text-slate-500">Cần xem thêm {remainingPercent}% để mở nút gửi kết quả.</span> : null}</div>
                </section> : null}

                {trackingEnabled ? <button
                  type="button"
                  disabled={Boolean(submission) || !eligibleToSubmit || submissionState === 'submitting'}
                  onClick={() => void handleSubmitPreparation()}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black transition ${submission ? 'cursor-default bg-emerald-600 text-white' : eligibleToSubmit ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70' : 'cursor-not-allowed bg-slate-100 text-slate-400 ring-1 ring-slate-200'}`}
                >
                  {submission ? <CheckCircle2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                  {submission ? 'Đã gửi kết quả chuẩn bị bài' : submissionState === 'submitting' ? 'Đang gửi và xác minh...' : 'Gửi kết quả chuẩn bị bài'}
                </button> : null}

                {trackingEnabled && !submission ? <section className="rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-100"><p className="font-black text-slate-800">Cách ghi nhận</p><p className="mt-1">Trong khi xem, tiến độ chỉ lưu trên thiết bị. Khi đạt đủ {threshold}%, nút gửi mới được mở. Chỉ sau khi Firestore xác nhận lần gửi thành công, giáo viên mới thấy em là “Đã chuẩn bị”.</p></section> : null}

                {submission ? <section className={`rounded-2xl p-3 text-xs leading-5 ring-1 ${submittedOnTime ? 'bg-emerald-50 text-emerald-800 ring-emerald-100' : 'bg-amber-50 text-amber-800 ring-amber-100'}`}><p className="font-black">{submittedOnTime ? '✓ Kết quả đã được ghi nhận' : '✓ Kết quả đã được ghi nhận muộn'}</p><p className="mt-1">Thời gian gửi: {formatDateTime(submission.submitted_at)} • Độ phủ khi gửi: {Math.round(submission.watch_percent)}%.</p></section> : null}

                {error ? <section className="rounded-2xl bg-rose-50 p-3 text-xs leading-5 text-rose-700 ring-1 ring-rose-100"><p className="flex items-center gap-2 font-black"><WifiOff className="h-4 w-4" /> Chưa thể hoàn tất thao tác</p><p className="mt-1">{error}</p>{eligibleToSubmit && !submission ? <button type="button" disabled={submissionState === 'submitting'} onClick={() => void handleSubmitPreparation()} className="mt-2 rounded-lg bg-white px-3 py-2 font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">Thử gửi lại</button> : null}</section> : null}

                <section className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-100"><p className="flex items-center gap-2 font-black"><LockKeyhole className="h-4 w-4" /> Chuẩn bị bài là nhiệm vụ cá nhân</p><p className="mt-1">Kết quả chuẩn bị chỉ được ghi cho tài khoản đang đăng nhập. Học cùng chỉ áp dụng khi vào bài học chính.</p></section>

                <details className="rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-100 lg:hidden"><summary className="cursor-pointer font-black text-slate-800">Cách tính tiến độ</summary><p className="mt-2">Tiến độ dựa trên độ phủ nội dung video. Tua qua không tính; xem lại cùng một đoạn không cộng thêm. Tiến độ chưa gửi được giữ trên thiết bị này.</p></details>
              </div>
            </aside>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
