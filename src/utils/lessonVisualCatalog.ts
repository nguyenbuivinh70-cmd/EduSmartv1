import {
  Atom,
  Binary,
  BookOpenText,
  Calculator,
  Code2,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Globe2,
  HardDrive,
  Image,
  Keyboard,
  Languages,
  Landmark,
  Map,
  Microscope,
  Monitor,
  Network,
  Presentation,
  Printer,
  ShieldCheck,
  Table2,
  Video,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

export interface LessonVisualDefinition {
  key: string;
  label: string;
  PrimaryIcon: LucideIcon;
  SecondaryIcon: LucideIcon;
  TertiaryIcon: LucideIcon;
  coverClass: string;
  iconClass: string;
  chipClass: string;
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

const THEMES = {
  indigo: {
    coverClass: 'from-indigo-600 via-violet-600 to-fuchsia-500',
    iconClass: 'bg-white/95 text-indigo-700',
    chipClass: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  },
  cyan: {
    coverClass: 'from-sky-600 via-cyan-500 to-teal-400',
    iconClass: 'bg-white/95 text-sky-700',
    chipClass: 'bg-sky-50 text-sky-700 ring-sky-100',
  },
  emerald: {
    coverClass: 'from-emerald-600 via-teal-500 to-cyan-400',
    iconClass: 'bg-white/95 text-emerald-700',
    chipClass: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  amber: {
    coverClass: 'from-amber-500 via-orange-500 to-rose-400',
    iconClass: 'bg-white/95 text-orange-700',
    chipClass: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
  rose: {
    coverClass: 'from-rose-600 via-pink-500 to-orange-400',
    iconClass: 'bg-white/95 text-rose-700',
    chipClass: 'bg-rose-50 text-rose-700 ring-rose-100',
  },
  slate: {
    coverClass: 'from-slate-700 via-slate-600 to-indigo-500',
    iconClass: 'bg-white/95 text-slate-700',
    chipClass: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
};

export function getLessonVisualCatalog(title: string, subject = ''): LessonVisualDefinition {
  const text = normalizeText(`${title} ${subject}`);

  if (hasAny(text, ['thiết bị vào ra', 'thiet bi vao ra', 'input output', 'thiết bị nhập', 'thiết bị xuất'])) {
    return { key: 'io-devices', label: 'Thiết bị vào / ra', PrimaryIcon: Monitor, SecondaryIcon: Keyboard, TertiaryIcon: Printer, ...THEMES.indigo };
  }
  if (hasAny(text, ['thông tin và dữ liệu', 'thong tin va du lieu', 'dữ liệu', 'du lieu', 'lưu trữ'])) {
    return { key: 'data', label: 'Thông tin & dữ liệu', PrimaryIcon: Database, SecondaryIcon: Binary, TertiaryIcon: HardDrive, ...THEMES.cyan };
  }
  if (hasAny(text, ['xử lý thông tin', 'xu ly thong tin', 'xử lí thông tin', 'xu li thong tin'])) {
    return { key: 'processing', label: 'Xử lý thông tin', PrimaryIcon: Cpu, SecondaryIcon: Code2, TertiaryIcon: Database, ...THEMES.indigo };
  }
  if (hasAny(text, ['mạng máy tính', 'mang may tinh', 'internet', 'kết nối mạng', 'ket noi mang', 'wifi'])) {
    return { key: 'network', label: 'Mạng & Internet', PrimaryIcon: Network, SecondaryIcon: Wifi, TertiaryIcon: Globe2, ...THEMES.cyan };
  }
  if (hasAny(text, ['an toàn thông tin', 'an toan thong tin', 'bảo mật', 'bao mat', 'mật khẩu', 'mat khau'])) {
    return { key: 'security', label: 'An toàn thông tin', PrimaryIcon: ShieldCheck, SecondaryIcon: Network, TertiaryIcon: HardDrive, ...THEMES.emerald };
  }
  if (hasAny(text, ['soạn thảo', 'soan thao', 'văn bản', 'van ban', 'word'])) {
    return { key: 'document', label: 'Soạn thảo văn bản', PrimaryIcon: FileText, SecondaryIcon: Keyboard, TertiaryIcon: BookOpenText, ...THEMES.cyan };
  }
  if (hasAny(text, ['bảng tính', 'bang tinh', 'excel', 'spreadsheet'])) {
    return { key: 'spreadsheet', label: 'Bảng tính', PrimaryIcon: Table2, SecondaryIcon: Calculator, TertiaryIcon: Database, ...THEMES.emerald };
  }
  if (hasAny(text, ['trình chiếu', 'trinh chieu', 'powerpoint', 'slide'])) {
    return { key: 'presentation', label: 'Trình chiếu', PrimaryIcon: Presentation, SecondaryIcon: Image, TertiaryIcon: Video, ...THEMES.rose };
  }
  if (hasAny(text, ['lập trình', 'lap trinh', 'python', 'thuật toán', 'thuat toan', 'chương trình', 'chuong trinh'])) {
    return { key: 'coding', label: 'Lập trình & thuật toán', PrimaryIcon: Code2, SecondaryIcon: Cpu, TertiaryIcon: Binary, ...THEMES.indigo };
  }
  if (hasAny(text, ['hình ảnh', 'hinh anh', 'đa phương tiện', 'da phuong tien', 'video', 'âm thanh', 'am thanh'])) {
    return { key: 'multimedia', label: 'Đa phương tiện', PrimaryIcon: Image, SecondaryIcon: Video, TertiaryIcon: Monitor, ...THEMES.rose };
  }

  const normalizedSubject = normalizeText(subject);
  if (normalizedSubject.includes('toan')) return { key: 'math', label: 'Toán học', PrimaryIcon: Calculator, SecondaryIcon: Binary, TertiaryIcon: Table2, ...THEMES.cyan };
  if (normalizedSubject.includes('van')) return { key: 'literature', label: 'Ngữ văn', PrimaryIcon: BookOpenText, SecondaryIcon: FileText, TertiaryIcon: Languages, ...THEMES.rose };
  if (normalizedSubject.includes('anh')) return { key: 'language', label: 'Ngoại ngữ', PrimaryIcon: Languages, SecondaryIcon: BookOpenText, TertiaryIcon: Globe2, ...THEMES.cyan };
  if (normalizedSubject.includes('ly')) return { key: 'physics', label: 'Vật lý', PrimaryIcon: Atom, SecondaryIcon: Calculator, TertiaryIcon: Monitor, ...THEMES.indigo };
  if (normalizedSubject.includes('hoa')) return { key: 'chemistry', label: 'Hóa học', PrimaryIcon: FlaskConical, SecondaryIcon: Atom, TertiaryIcon: Calculator, ...THEMES.emerald };
  if (normalizedSubject.includes('sinh')) return { key: 'biology', label: 'Sinh học', PrimaryIcon: Microscope, SecondaryIcon: Image, TertiaryIcon: BookOpenText, ...THEMES.emerald };
  if (normalizedSubject.includes('su')) return { key: 'history', label: 'Lịch sử', PrimaryIcon: Landmark, SecondaryIcon: BookOpenText, TertiaryIcon: Map, ...THEMES.amber };
  if (normalizedSubject.includes('dia')) return { key: 'geography', label: 'Địa lý', PrimaryIcon: Map, SecondaryIcon: Globe2, TertiaryIcon: Image, ...THEMES.emerald };

  return { key: 'default', label: subject || 'Bài học số', PrimaryIcon: Code2, SecondaryIcon: Monitor, TertiaryIcon: BookOpenText, ...THEMES.slate };
}
