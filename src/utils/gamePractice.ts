export type HtmlGameCompatibility = 'contract' | 'legacy_auto' | 'preview_only';

export interface HtmlGameImportInfo {
  title: string;
  compatibility: HtmlGameCompatibility;
  warnings: string[];
  hasExplicitContract: boolean;
  detectedLegacyAdapter?: string;
  externalResources: string[];
}

function cleanTitle(value: string) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function extractHtmlGameTitle(html: string, fallback = 'Trò chơi luyện tập') {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanTitle(match?.[1] || fallback) || fallback;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function inspectHtmlGame(html: string, fileName = ''): HtmlGameImportInfo {
  const source = String(html || '');
  if (!/<html[\s>]/i.test(source) || !/<body[\s>]/i.test(source)) {
    throw new Error('File trò chơi phải là một tài liệu HTML hoàn chỉnh có thẻ <html> và <body>.');
  }
  if (!/<script[\s>]/i.test(source)) {
    throw new Error('Không tìm thấy JavaScript điều khiển trò chơi trong file HTML.');
  }
  if (source.length > 700_000) {
    throw new Error('File trò chơi vượt quá giới hạn an toàn 700 KB. Hãy tối ưu hoặc đóng gói tài nguyên trước khi tải lên.');
  }
  const warnings: string[] = [];
  const hasExplicitContract = /EDUSMART_GAME_(?:READY|FINISH|PROGRESS|EXIT)|EduSmartGame\s*\./i.test(source);
  const isKeepCastle = /\bGAME_DATA\b/.test(source) && /function\s+endGame\s*\(/.test(source) && /codesCleared|mistakes/.test(source);
  const remoteMatches = [...source.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  const externalResources = unique(remoteMatches);
  if (externalResources.length) warnings.push(`Có ${externalResources.length} tài nguyên ngoài Internet; trò chơi cần kết nối mạng để hiển thị đầy đủ.`);
  if (/<iframe[\s>]/i.test(source)) warnings.push('File có iframe lồng bên trong; một số nội dung bên thứ ba có thể bị sandbox chặn.');
  if (/\b(?:window\.)?open\s*\(/i.test(source)) warnings.push('File có lệnh mở cửa sổ mới; EduSmart sẽ không cấp quyền popup mặc định.');
  if (/\b(?:top|parent)\.location\b/i.test(source)) warnings.push('File có lệnh điều hướng trang cha; sandbox của EduSmart sẽ chặn thao tác này.');
  if (/navigator\.(?:mediaDevices|geolocation)|getUserMedia\s*\(/i.test(source)) warnings.push('File yêu cầu quyền thiết bị; quyền camera/vị trí không được bật trong Game Runtime mặc định.');

  let compatibility: HtmlGameCompatibility = 'preview_only';
  let detectedLegacyAdapter: string | undefined;
  if (hasExplicitContract) compatibility = 'contract';
  else if (isKeepCastle) {
    compatibility = 'legacy_auto';
    detectedLegacyAdapter = 'keep-castle-v1';
    warnings.push('Đã nhận diện game kiểu “Giữ Thành”; EduSmart sẽ tự gắn cầu nối kết quả V1.');
  } else {
    warnings.push('Chưa thấy EduSmart Game Contract V1. Game vẫn xem thử được nhưng cần bổ sung cầu nối FINISH để lưu kết quả tự động.');
  }

  return {
    title: extractHtmlGameTitle(source, fileName.replace(/\.html?$/i, '') || 'Trò chơi luyện tập'),
    compatibility,
    warnings,
    hasExplicitContract,
    detectedLegacyAdapter,
    externalResources,
  };
}

function bridgeScript(adapter?: string) {
  const legacyAdapter = adapter === 'keep-castle-v1' ? `
  function legacySnapshot(win, success, message) {
    try {
      const s = typeof state !== 'undefined' ? state : null;
      const data = typeof GAME_DATA !== 'undefined' ? GAME_DATA : null;
      if (!s) return { completed: !!success, message: message || '' };
      let correct = Number(s.codesCleared || 0);
      if (data && Array.isArray(data.levels)) {
        const completedLevels = s.isBoss ? data.levels.length : Math.max(0, Number(s.levelIndex || 0));
        correct += data.levels.slice(0, completedLevels).reduce((sum, level) => sum + Number(level.requirement || 0), 0);
      }
      const wrong = Array.isArray(s.mistakes) ? s.mistakes.length : 0;
      const total = Math.max(0, correct + wrong);
      const score10 = total > 0 ? Math.round((correct / total) * 1000) / 100 : 0;
      return {
        completed: true,
        success: !!success,
        message: message || '',
        score10,
        rawScore: Number(s.score || 0),
        correct,
        wrong,
        total,
        maxCombo: Number(s.maxCombo || 0),
        durationSeconds: Number(s.playTime || 0) || Math.max(0, Math.floor((Date.now() - Number(s.startTime || Date.now())) / 1000)),
        levelReached: s.isBoss ? 'BOSS' : Number(s.levelIndex || 0) + 1,
        mistakes: Array.isArray(s.mistakes) ? s.mistakes.slice(0, 100) : [],
      };
    } catch (error) {
      return { completed: !!success, message: message || '', adapterError: String(error && error.message || error) };
    }
  }
  try {
    window.onEduSmartForceFinish = function(){
      try { if (typeof state !== 'undefined') state.isPaused = true; } catch (_) {}
      window.EduSmartGame.finish(Object.assign(legacySnapshot(window, false, 'Hết thời gian'), { timedOut: true }));
    };
    if (typeof endGame === 'function' && !endGame.__edusmartWrapped) {
      const originalEndGame = endGame;
      const wrapped = function(success, message) {
        const result = originalEndGame.apply(this, arguments);
        setTimeout(function(){ window.EduSmartGame.finish(legacySnapshot(window, success, message)); }, 0);
        return result;
      };
      wrapped.__edusmartWrapped = true;
      endGame = wrapped;
    }
  } catch (_) {}
` : '';
  return `<script id="edusmart-game-runtime-v1">
(function(){
  if (window.__EDUSMART_GAME_RUNTIME_V1__) return;
  window.__EDUSMART_GAME_RUNTIME_V1__ = true;
  const send = (type, payload) => {
    try { window.parent.postMessage({ channel: 'EDUSMART_GAME_V1', type, payload: payload || {}, sentAt: Date.now() }, '*'); } catch (_) {}
  };
  window.EduSmartGame = Object.freeze({
    ready: (payload) => send('EDUSMART_GAME_READY', payload),
    progress: (payload) => send('EDUSMART_GAME_PROGRESS', payload),
    finish: (payload) => send('EDUSMART_GAME_FINISH', payload),
    exit: (payload) => send('EDUSMART_GAME_EXIT', payload),
  });
  window.addEventListener('message', function(event){
    const data = event && event.data;
    if (!data || data.channel !== 'EDUSMART_HOST_V1') return;
    if (data.type === 'EDUSMART_HOST_INIT') {
      window.__EDUSMART_CONTEXT__ = data.payload || {};
      send('EDUSMART_GAME_READY', { runtime: 'v1', receivedContext: true });
    }
    if (data.type === 'EDUSMART_GAME_FORCE_FINISH') {
      try {
        if (typeof window.onEduSmartForceFinish === 'function') window.onEduSmartForceFinish(data.payload || {});
        else send('EDUSMART_GAME_FINISH', { completed: false, timedOut: true, score10: 0, rawScore: 0, correct: 0, wrong: 0, total: 0, message: 'Hết thời gian' });
      } catch (_) {
        send('EDUSMART_GAME_FINISH', { completed: false, timedOut: true, score10: 0, rawScore: 0, correct: 0, wrong: 0, total: 0, message: 'Hết thời gian' });
      }
    }
  });
  ${legacyAdapter}
  send('EDUSMART_GAME_READY', { runtime: 'v1', adapter: ${JSON.stringify(adapter || 'contract')} });
})();
<\/script>`;
}

export function prepareHtmlGameForRuntime(html: string, info?: HtmlGameImportInfo) {
  const source = String(html || '');
  if (/id=["']edusmart-game-runtime-v1["']/i.test(source)) return source;
  const bridge = bridgeScript(info?.detectedLegacyAdapter);
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${bridge}\n</body>`);
  return `${source}\n${bridge}`;
}

export function createGamePromptTemplate() {
  return `YÊU CẦU TÍCH HỢP EDUSMART GAME CONTRACT V1:\n- Trò chơi phải là 01 file HTML tự chạy.\n- Khi tải xong gọi: window.EduSmartGame?.ready({title: 'Tên trò chơi'}).\n- Khi có tiến độ có thể gọi: window.EduSmartGame?.progress({rawScore, correct, wrong, total, levelReached}).\n- Khi kết thúc BẮT BUỘC gọi đúng một lần: window.EduSmartGame?.finish({score10, rawScore, correct, wrong, total, durationSeconds, maxCombo, levelReached, mistakes, completed: true}).\n- score10 là điểm học tập từ 0 đến 10; rawScore là điểm game để tạo hứng thú.\n- Không truy cập Firebase, không lưu dữ liệu bên ngoài, không điều hướng trang cha.\n- Hỗ trợ màn hình máy tính và cảm ứng; toàn bộ nút phải dùng được trong iframe sandbox.`;
}
