import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const APP_VERSION = 'EduSmart V6.98.6';
const rootElement = document.getElementById('root');

declare global {
  interface Window {
    __EDUSMART_STARTUP_WATCHDOG__?: number;
    __EDUSMART_SHOW_RECOVERY__?: () => void;
  }
}

function clearStartupWatchdog() {
  if (window.__EDUSMART_STARTUP_WATCHDOG__) {
    window.clearTimeout(window.__EDUSMART_STARTUP_WATCHDOG__);
    delete window.__EDUSMART_STARTUP_WATCHDOG__;
  }
}

function resetLoginSessionAndReload() {
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('aiConfig');
    sessionStorage.clear();
  } catch {
    // Storage may be unavailable in a restricted browser context.
  }
  window.location.replace(`${window.location.pathname}?refresh=${Date.now()}`);
}

function reloadApplication() {
  window.location.replace(`${window.location.pathname}?refresh=${Date.now()}`);
}

function RecoveryView({ title = 'Ứng dụng chưa thể mở', message = 'Vui lòng tải lại trang để tiếp tục.' }: { title?: string; message?: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 24, fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 560, width: '100%', background: '#fff', borderRadius: 28, padding: 32, textAlign: 'center', boxShadow: '0 24px 70px rgba(15,23,42,.16)', border: '1px solid #e2e8f0' }}>
        <div style={{ width: 68, height: 68, margin: '0 auto', borderRadius: 22, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900 }}>↻</div>
        <h1 style={{ margin: '20px 0 0', fontSize: 24, color: '#0f172a' }}>{title}</h1>
        <p style={{ margin: '12px 0 0', color: '#475569', lineHeight: 1.7, fontSize: 14 }}>{message}</p>
        <div style={{ marginTop: 22, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={reloadApplication} style={{ border: 'none', borderRadius: 14, background: '#4f46e5', color: '#fff', padding: '11px 16px', fontWeight: 800, cursor: 'pointer' }}>Tải lại ứng dụng</button>
          <button type="button" onClick={resetLoginSessionAndReload} style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', color: '#334155', padding: '11px 16px', fontWeight: 800, cursor: 'pointer' }}>Đăng nhập lại</button>
        </div>
        <p style={{ margin: '16px 0 0', color: '#94a3b8', fontSize: 12 }}>{APP_VERSION}</p>
      </div>
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[EduSmart][UI] Application render failed', error, info);
  }

  render() {
    if (this.state.failed) {
      return <RecoveryView title="Ứng dụng cần được tải lại" message="Phiên làm việc chưa khởi tạo hoàn tất. Vui lòng tải lại ứng dụng hoặc đăng nhập lại để tiếp tục." />;
    }
    return this.props.children;
  }
}

function mountApplication() {
  if (!rootElement) {
    console.error('[EduSmart][BOOT] Missing root element');
    return;
  }

  clearStartupWatchdog();
  rootElement.dataset.eduReactMounted = '1';

  try {
    createRoot(rootElement).render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>,
    );
  } catch (error) {
    console.error('[EduSmart][BOOT] Mount failed', error);
    rootElement.dataset.eduReactMounted = '0';
    createRoot(rootElement).render(
      <RecoveryView title="Ứng dụng chưa thể mở" message="Vui lòng tải lại ứng dụng. Nếu tình trạng vẫn tiếp diễn, hãy chọn “Đăng nhập lại”." />,
    );
  }
}

mountApplication();
