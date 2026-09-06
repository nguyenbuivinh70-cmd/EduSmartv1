import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');
const APP_VERSION = 'EduSmart V6.73.2 CleanLessonArenaCards';
let hasMountedReactApp = false;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clearOldSessionAndReload() {
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('aiConfig');
    sessionStorage.clear();
  } catch {
    // ignore storage errors
  }
  window.location.reload();
}

function renderStartupScreen(message = 'Đang khởi động giao diện học tập...') {
  if (!rootElement || rootElement.dataset.eduReactMounted === '1') return;
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:520px;width:100%;background:#fff;border-radius:26px;padding:30px;text-align:center;box-shadow:0 22px 60px rgba(15,23,42,.16);border:1px solid #e2e8f0">
        <div style="width:68px;height:68px;margin:0 auto;border-radius:22px;background:linear-gradient(135deg,#4f46e5,#d946ef);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900">E</div>
        <h1 style="margin:20px 0 0;font-size:24px;color:#0f172a">EduSmart đang mở ứng dụng</h1>
        <p style="margin:12px 0 0;color:#475569;line-height:1.7;font-size:14px">${escapeHtml(message)}</p>
        <div style="margin:22px auto 0;width:220px;height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:45%;background:linear-gradient(90deg,#4f46e5,#d946ef);border-radius:999px;animation:eduPulse 1.15s infinite alternate"></div>
        </div>
        <style>@keyframes eduPulse{from{transform:translateX(-90%)}to{transform:translateX(235%)}}</style>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">${APP_VERSION}</p>
      </div>
    </div>`;
}

function renderRecoveryScreen(error?: unknown) {
  if (!rootElement) return;
  const rawMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'Lỗi hiển thị không xác định');
  const message = escapeHtml(rawMessage);
  rootElement.dataset.eduReactMounted = '0';
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:660px;width:100%;background:#fff;border-radius:28px;padding:30px;text-align:center;box-shadow:0 24px 70px rgba(15,23,42,.18);border:1px solid #e2e8f0">
        <div style="width:68px;height:68px;margin:0 auto;border-radius:22px;background:#fff1f2;color:#e11d48;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:900">!</div>
        <h1 style="margin:20px 0 0;font-size:24px;color:#0f172a">Ứng dụng cần khởi động lại</h1>
        <p style="margin:12px 0 0;color:#475569;line-height:1.7;font-size:14px">Phiên bản mới gặp lỗi khi khởi tạo giao diện. Hãy tải lại ứng dụng. Nếu vẫn lỗi, hãy xóa phiên cũ để đăng nhập lại bằng dữ liệu mới.</p>
        <div style="margin:16px 0 0;background:#f8fafc;border-radius:16px;padding:12px;text-align:left;color:#64748b;font-size:12px;word-break:break-word;max-height:140px;overflow:auto">${message}</div>
        <div style="margin-top:22px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <button id="edu-reload" style="border:none;border-radius:16px;background:#4f46e5;color:white;padding:12px 18px;font-weight:800;cursor:pointer">Tải lại ứng dụng</button>
          <button id="edu-reset" style="border:1px solid #e2e8f0;border-radius:16px;background:white;color:#334155;padding:12px 18px;font-weight:800;cursor:pointer">Xóa phiên cũ</button>
        </div>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">${APP_VERSION}</p>
      </div>
    </div>`;
  document.getElementById('edu-reload')?.addEventListener('click', () => window.location.reload());
  document.getElementById('edu-reset')?.addEventListener('click', clearOldSessionAndReload);
}

function reportStartupError(error: unknown) {
  console.error('EduSmart startup/runtime error:', error);
  renderRecoveryScreen(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

window.addEventListener('error', (event) => {
  if (!hasMountedReactApp || !rootElement?.children.length) {
    reportStartupError(event.error || event.message);
  } else {
    console.error('EduSmart runtime error:', event.error || event.message);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (!hasMountedReactApp || !rootElement?.children.length) {
    reportStartupError(event.reason);
  } else {
    console.error('EduSmart unhandled promise rejection:', event.reason);
  }
});

async function bootstrap() {
  if (!rootElement) {
    renderRecoveryScreen('Không tìm thấy phần tử root của ứng dụng.');
    return;
  }

  renderStartupScreen();

  const slowStartupTimer = window.setTimeout(() => {
    if (!hasMountedReactApp) {
      renderStartupScreen('Ứng dụng đang nạp dữ liệu. Nếu màn hình đứng quá lâu, hãy bấm tải lại hoặc xóa phiên cũ ở bản vá mới.');
    }
  }, 7000);

  try {
    const { default: App } = await withTimeout(import('./App.tsx'), 30000, 'Tải giao diện quá lâu. Có thể Google AI Studio đang giữ cache phiên bản cũ hoặc file nguồn chưa được biên dịch xong.');
    window.clearTimeout(slowStartupTimer);
    rootElement.dataset.eduReactMounted = '1';
    hasMountedReactApp = true;
    createRoot(rootElement).render(<App />);
  } catch (error) {
    window.clearTimeout(slowStartupTimer);
    reportStartupError(error);
  }
}

void bootstrap();
