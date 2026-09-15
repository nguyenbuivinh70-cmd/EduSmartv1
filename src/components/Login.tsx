import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpenCheck, Eye, EyeOff, Lock, LogIn, MessageCircleMore, User } from 'lucide-react';
import { loginApi } from '../services/api';
import { User as UserType } from '../types';

interface LoginProps {
  onLoginSuccess: (user: UserType) => void;
  setLoading: (loading: boolean) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function Login({ onLoginSuccess, setLoading, showToast }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Vui lòng nhập đầy đủ thông tin', 'error');
      return;
    }

    setLoading(true);
    const res = await loginApi(email.trim(), password);
    setLoading(false);

    if (res.ok && res.data) {
      showToast('Đăng nhập thành công', 'success');
      onLoginSuccess(res.data);
      return;
    }

    showToast(res.message || 'Đăng nhập thất bại', 'error');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-6 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-200/45 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-violet-200/45 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-[470px]"
        >
          <div className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
            <div className="border-b border-slate-100 px-5 py-6 text-center sm:px-8 sm:py-7">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25">
                <BookOpenCheck className="h-7 w-7" />
              </div>
              <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.24em] text-indigo-600">EduSmart</p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                Học Tập Thông Minh Tin học
              </h1>
            </div>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              <div className="text-center">
                <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Chào mừng trở lại!</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Đăng nhập để tiếp tục học tập và theo dõi kết quả.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">Tài khoản</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-[15px] text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Email Firebase hoặc tên đăng nhập"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">Mật khẩu</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-12 text-[15px] text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Nhập mật khẩu"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-700 active:scale-[0.99]"
                >
                  <LogIn className="h-5 w-5" />
                  Đăng nhập
                </button>
              </form>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <a
                  href="https://zalo.me/0919998300"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 transition-colors hover:bg-indigo-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/70">
                    <MessageCircleMore className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-800">Cần hỗ trợ tài khoản?</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Thầy Bùi Quang Thắng · Zalo <span className="font-semibold text-indigo-700">0919998300</span>
                    </p>
                  </div>
                </a>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">EduSmart · Học Tập Thông Minh Tin học</p>
        </motion.div>
      </div>
    </div>
  );
}
