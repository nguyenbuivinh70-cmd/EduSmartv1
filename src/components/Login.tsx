import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, User, Lock, Eye, EyeOff } from 'lucide-react';
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
    <div className="flex min-h-screen items-center justify-center bg-bg-main p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md overflow-hidden rounded-[24px] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.05)]"
      >
        <div className="bg-primary p-10 text-center text-white">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md"
          >
            <Lock className="h-8 w-8" />
          </motion.div>
          <h1 className="text-2xl font-extrabold tracking-tight">Chào mừng trở lại!</h1>
          <p className="mt-2 text-white/80">Đăng nhập để tiếp tục học tập</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-8">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-main">Email Firebase hoặc tên đăng nhập</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-3.5 pl-12 pr-4 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Email Firebase hoặc tài khoản hiện tại"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-main">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-3.5 pl-12 pr-12 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Nhập mật khẩu"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/30 transition-all hover:bg-indigo-700 active:scale-[0.98]"
          >
            <LogIn className="h-5 w-5" />
            Đăng nhập ngay
          </button>



          <div className="text-center">
            <p className="text-sm text-text-muted">
              Chưa có tài khoản? <span className="font-semibold text-primary cursor-pointer hover:underline">Liên hệ quản trị viên</span>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
