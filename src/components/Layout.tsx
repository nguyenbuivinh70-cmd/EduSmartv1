import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu, X, LayoutDashboard, Users, BookOpen, GraduationCap,
  Settings, LogOut, User as UserIcon, CheckSquare, PlusCircle,
  Bell, Search, FolderKanban, Trophy, BarChart3, ClipboardList, MonitorPlay, CalendarDays, WifiOff
} from 'lucide-react';
import { User } from '../types';


function hasAdminPermission(user: User) {
  if (user.vai_tro === 'admin') return true;
  const delegated = String(user.quyen_admin ?? '').trim().toLowerCase();
  return user.vai_tro === 'teacher' && ['true', '1', 'yes', 'y', 'on', 'co', 'có'].includes(delegated);
}

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
}

export default function Layout({ user, onLogout, children, activeMenu, setActiveMenu }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      setIsSidebarOpen(!mobile);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const adminMenu = [
    { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: 'accounts', label: 'Tài khoản', icon: <Users className="h-5 w-5" /> },
    { id: 'classes', label: 'Lớp học', icon: <GraduationCap className="h-5 w-5" /> },
    { id: 'subjects', label: 'Môn học', icon: <BookOpen className="h-5 w-5" /> },
    { id: 'lessons', label: 'Bài học', icon: <FolderKanban className="h-5 w-5" /> },
    { id: 'approvals', label: 'Duyệt chia sẻ', icon: <CheckSquare className="h-5 w-5" /> },
    { id: 'arena', label: 'Đấu trường tri thức', icon: <Trophy className="h-5 w-5" /> },
    { id: 'analytics', label: 'Theo dõi học tập', icon: <BarChart3 className="h-5 w-5" /> },
    { id: 'school_years', label: 'Cấu hình năm học', icon: <CalendarDays className="h-5 w-5" /> },
    { id: 'video_config', label: 'Cấu hình video', icon: <MonitorPlay className="h-5 w-5" /> },
    { id: 'ai_config', label: 'Cấu hình AI', icon: <Settings className="h-5 w-5" /> },
  ];

  const teacherMenu = [
    { id: 'learning', label: 'Học tập', icon: <BookOpen className="h-5 w-5" /> },
    { id: 'my_lessons', label: 'Bài học của tôi', icon: <FolderKanban className="h-5 w-5" /> },
    { id: 'create_lesson', label: 'Tạo bài học', icon: <PlusCircle className="h-5 w-5" /> },
    { id: 'arena', label: 'Đấu trường tri thức', icon: <Trophy className="h-5 w-5" /> },
    { id: 'analytics', label: 'Theo dõi học tập', icon: <ClipboardList className="h-5 w-5" /> },
    { id: 'ai_config', label: 'Cấu hình AI', icon: <Settings className="h-5 w-5" /> },
    { id: 'profile', label: 'Hồ sơ cá nhân', icon: <UserIcon className="h-5 w-5" /> },
  ];

  const adminLike = hasAdminPermission(user);

  const studentMenu = [
    { id: 'learning', label: 'Học tập', icon: <BookOpen className="h-5 w-5" /> },
    { id: 'arena', label: 'Đấu trường tri thức', icon: <Trophy className="h-5 w-5" /> },
    { id: 'ai_config', label: 'Cấu hình AI', icon: <Settings className="h-5 w-5" /> },
    { id: 'profile', label: 'Hồ sơ cá nhân', icon: <UserIcon className="h-5 w-5" /> },
  ];

  const menuItems = adminLike ? adminMenu : user.vai_tro === 'teacher' ? teacherMenu : studentMenu;
  const roleLabel = user.vai_tro === 'admin' ? 'Quản trị viên' : adminLike ? 'Giáo viên + quyền admin' : user.vai_tro === 'teacher' ? 'Giáo viên' : 'Học sinh';

  return (
    <div className="notranslate flex h-dvh overflow-hidden bg-bg-main" translate="no">
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{
          x: isSidebarOpen ? 0 : -300,
          width: isSidebarOpen ? (isMobile ? 240 : 240) : 0,
        }}
        className="fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#E2E8F0] bg-white pb-[env(safe-area-inset-bottom)] lg:static lg:z-0 lg:pb-0"
      >
        <div className="flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-primary">EduSmart</span>
          </div>
          {isMobile && (
            <button onClick={() => setIsSidebarOpen(false)} className="rounded-lg p-2 hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveMenu(item.id);
                if (isMobile) setIsSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                activeMenu === item.id
                  ? 'bg-[#EEF2FF] text-primary'
                  : 'text-text-muted hover:bg-[#F8FAFC] hover:text-text-main'
              }`}
            >
              <span className={activeMenu === item.id ? 'text-primary' : 'text-text-muted'}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {user.vai_tro !== 'teacher' && (
          <div className="mt-auto space-y-2 p-4">
            <button
              onClick={() => setActiveMenu('profile')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                activeMenu === 'profile'
                  ? 'bg-[#EEF2FF] text-primary'
                  : 'text-text-muted hover:bg-[#F8FAFC] hover:text-text-main'
              }`}
            >
              <UserIcon className="h-5 w-5" />
              Hồ sơ cá nhân
            </button>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-danger transition-all hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" />
              Đăng xuất
            </button>
          </div>
        )}

        {user.vai_tro === 'teacher' && (
          <div className="mt-auto space-y-2 p-4">
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-danger transition-all hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" />
              Đăng xuất
            </button>
          </div>
        )}
      </motion.aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between bg-bg-main/90 px-3 backdrop-blur-md sm:px-5 lg:h-20 lg:px-10">
          <div className="flex items-center gap-4">
            {isMobile && (
              <button onClick={() => setIsSidebarOpen(true)} className="rounded-lg p-2 hover:bg-gray-100">
                <Menu className="h-6 w-6 text-text-main" />
              </button>
            )}
            <div className="hidden w-[320px] items-center gap-2 rounded-[20px] border border-[#E2E8F0] bg-white px-5 py-2.5 lg:flex">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Tìm kiếm ở màn hình hiện tại..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-text-muted"
                readOnly
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!isOnline ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1.5 text-[11px] font-bold text-amber-800"><WifiOff className="h-3.5 w-3.5" /> Ngoại tuyến</span> : null}
            <button className="relative rounded-xl p-2 text-text-muted hover:bg-white/50">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-3">
              <div className="max-w-[180px] text-right sm:max-w-[260px]">
                <p className="text-[14px] font-semibold text-text-main">{user.ho_ten}</p>
                <p className="hidden text-[12px] font-medium text-text-muted sm:block">
                  {roleLabel}
                  {!adminLike && user.vai_tro !== 'admin' && user.khoi ? ` • Khối ${user.khoi}` : ''}
                  {user.vai_tro === 'student' && user.lop_id ? ` • ${user.lop_id}` : ''}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] ring-2 ring-white shadow-sm"></div>
            </div>
          </div>
        </header>

        <main className={`notranslate flex-1 overflow-y-auto px-3 pt-1 sm:px-5 lg:px-10 ${isMobile && user.vai_tro === 'student' && !adminLike ? 'pb-28' : 'pb-10'}`} translate="no">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>

        {isMobile && user.vai_tro === 'student' && !adminLike ? (
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl" aria-label="Điều hướng học sinh">
            {studentMenu.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveMenu(item.id)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition ${activeMenu === item.id ? 'bg-indigo-50 text-primary' : 'text-slate-500 active:bg-slate-100'}`}
              >
                {item.icon}
                <span className="line-clamp-1">{item.label}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
