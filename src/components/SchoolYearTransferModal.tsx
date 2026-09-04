import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowRightLeft, CheckCircle2, ChevronsLeft, ChevronsRight, GraduationCap, History, Loader2, RefreshCw, Search, Users, X } from 'lucide-react';
import { Account, CatalogClass, MoveStudentsPayload, SchoolYear, SchoolYearTransferPayload } from '../types';

interface Props {
  isOpen: boolean;
  schoolYears: SchoolYear[];
  classes: CatalogClass[];
  accounts: Account[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: SchoolYearTransferPayload) => void;
  onMoveStudents?: (payload: MoveStudentsPayload) => Promise<boolean>;
}

type TransferTab = 'classes' | 'students';

function getCurrentYear(schoolYears: SchoolYear[]) {
  const current = schoolYears.find((item) => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true');
  return current?.ten_nam_hoc || schoolYears[0]?.ten_nam_hoc || '';
}

function inferNextYear(value: string) {
  const match = String(value || '').match(/(\d{4})\s*-\s*(\d{4})/);
  if (!match) return '';
  const start = Number(match[1]) + 1;
  return `${start}-${start + 1}`;
}

function getSchoolYearName(item: SchoolYear) {
  return String(item.ten_nam_hoc || '').trim();
}

function getDefaultTargetYear(schoolYears: SchoolYear[], sourceYear: string) {
  const source = String(sourceYear || getCurrentYear(schoolYears)).trim();
  const options = schoolYears.map(getSchoolYearName).filter(Boolean).filter((year) => year !== source);
  const expectedNextYear = inferNextYear(source);
  return options.find((year) => year === expectedNextYear) || options[0] || '';
}

function normalizeGrade(value?: string | number) {
  return String(value ?? '').trim().replace(/\.0+$/, '');
}

function normalizeClassId(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function matchesYear(itemYear: unknown, year: string) {
  const raw = String(itemYear || '').trim();
  return !year || !raw || raw === year;
}

function getNextGrade(grade: string) {
  const n = Number(normalizeGrade(grade));
  if (!Number.isFinite(n) || n >= 9) return '';
  return String(n + 1);
}

function deriveNextName(name: string, grade: string) {
  const next = getNextGrade(grade);
  if (!next) return '';
  return String(name || '').replace(new RegExp(`^${grade}`), next).replace(new RegExp(`Khối\\s*${grade}`, 'i'), `Khối ${next}`) || `Lớp ${next}`;
}

function statusLabel(status?: string) {
  const raw = String(status || 'active').toLowerCase();
  if (raw === 'active') return 'Hoạt động';
  if (raw === 'inactive') return 'Tạm khóa';
  return status || 'Hoạt động';
}

function StudentTable({
  title,
  grade,
  className,
  students,
  selectedIds,
  onToggle,
  onToggleAll,
}: {
  title: string;
  grade?: string;
  className?: string;
  students: Account[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allChecked = students.length > 0 && students.every((item) => selectedIds.includes(item.user_id));
  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div>
          <h5 className="font-black text-slate-900">{title}</h5>
          <p className="text-xs font-semibold text-slate-500">Khối {grade || '-'} • Lớp {className || '-'} • {students.length} học sinh</p>
        </div>
        <button type="button" onClick={onToggleAll} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">
          {allChecked ? 'Bỏ chọn' : 'Chọn tất cả'}
        </button>
      </div>
      <div className="max-h-[430px] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white text-xs uppercase tracking-wider text-slate-500 shadow-sm">
            <tr>
              <th className="w-10 px-3 py-3 text-left"></th>
              <th className="w-12 px-2 py-3 text-left">STT</th>
              <th className="px-2 py-3 text-left">Mã HS</th>
              <th className="px-2 py-3 text-left">Họ tên</th>
              <th className="w-16 px-2 py-3 text-left">T.thái</th>
              <th className="w-16 px-2 py-3 text-left">Lịch sử</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((student, index) => {
              const checked = selectedIds.includes(student.user_id);
              const active = String(student.trang_thai || 'active').toLowerCase() === 'active';
              return (
                <tr key={student.user_id} className={checked ? 'bg-indigo-50' : 'hover:bg-slate-50'}>
                  <td className="px-3 py-2"><input type="checkbox" checked={checked} onChange={() => onToggle(student.user_id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /></td>
                  <td className="px-2 py-2 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-2 py-2 font-mono text-xs text-slate-500">{student.ma_hoc_sinh || student.user_id}</td>
                  <td className="px-2 py-2 font-bold text-slate-900">{student.ho_ten}</td>
                  <td className="px-2 py-2"><span title={statusLabel(student.trang_thai)} className={`inline-block h-3 w-3 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} /></td>
                  <td className="px-2 py-2"><History className="h-4 w-4 text-sky-500" /></td>
                </tr>
              );
            })}
            {!students.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">Chưa có học sinh phù hợp.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SchoolYearTransferModal({ isOpen, schoolYears, classes, accounts, isSubmitting = false, onClose, onSubmit, onMoveStudents }: Props) {
  const currentYear = useMemo(() => getCurrentYear(schoolYears), [schoolYears]);
  const [activeTab, setActiveTab] = useState<TransferTab>('classes');
  const [sourceYear, setSourceYear] = useState(currentYear);
  const [targetYear, setTargetYear] = useState(() => getDefaultTargetYear(schoolYears, currentYear));
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['6', '7', '8', '9']);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [includeStudents, setIncludeStudents] = useState(false);
  const [graduateFinalGrade, setGraduateFinalGrade] = useState(true);
  const [setTargetCurrent, setSetTargetCurrent] = useState(true);
  const [archiveSourceClasses, setArchiveSourceClasses] = useState(false);

  const [moveYear, setMoveYear] = useState(currentYear);
  const [sourceGrade, setSourceGrade] = useState('6');
  const [targetGrade, setTargetGrade] = useState('6');
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [selectedSourceStudentIds, setSelectedSourceStudentIds] = useState<string[]>([]);
  const [selectedTargetStudentIds, setSelectedTargetStudentIds] = useState<string[]>([]);
  const [moveSubmitting, setMoveSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const year = getCurrentYear(schoolYears);
    setActiveTab('classes');
    setSourceYear(year);
    setTargetYear(getDefaultTargetYear(schoolYears, year));
    setSelectedGrades(['6', '7', '8', '9']);
    setSelectedClassIds([]);
    setIncludeStudents(false);
    setGraduateFinalGrade(true);
    setSetTargetCurrent(true);
    setArchiveSourceClasses(false);
    setMoveYear(year);
    setSourceGrade('6');
    setTargetGrade('6');
    setSourceQuery('');
    setTargetQuery('');
    setSelectedSourceStudentIds([]);
    setSelectedTargetStudentIds([]);
  }, [isOpen, schoolYears]);

  const availableGrades = useMemo(() => {
    const items = Array.from(new Set(classes.map((item) => normalizeGrade(item.khoi)).filter(Boolean)));
    return (items.length ? items : ['6', '7', '8', '9']).sort((a, b) => Number(a) - Number(b));
  }, [classes]);

  const sourceClassesForPromotion = useMemo(() => classes
    .filter((item) => selectedGrades.includes(normalizeGrade(item.khoi)) && matchesYear(item.nam_hoc, sourceYear))
    .sort((a, b) => String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi')),
  [classes, selectedGrades, sourceYear]);

  useEffect(() => {
    setSelectedClassIds((current) => current.filter((id) => sourceClassesForPromotion.some((item) => normalizeClassId(item.lop_id) === normalizeClassId(id))));
  }, [sourceClassesForPromotion]);

  const targetClassesForPromotion = useMemo(() => {
    const nextGrades = selectedGrades.map(getNextGrade).filter(Boolean);
    return classes
      .filter((item) => nextGrades.includes(normalizeGrade(item.khoi)) && String(item.nam_hoc || '').trim() === targetYear)
      .sort((a, b) => String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi'));
  }, [classes, selectedGrades, targetYear]);

  const moveClasses = useMemo(() => classes.filter((item) => matchesYear(item.nam_hoc, moveYear) || String(item.nam_hoc || '').trim() === moveYear), [classes, moveYear]);
  const sourceClassOptions = useMemo(() => moveClasses.filter((item) => normalizeGrade(item.khoi) === sourceGrade).sort((a, b) => String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi')), [moveClasses, sourceGrade]);
  const targetClassOptions = useMemo(() => moveClasses.filter((item) => normalizeGrade(item.khoi) === targetGrade).sort((a, b) => String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi')), [moveClasses, targetGrade]);

  useEffect(() => {
    if (!sourceClassOptions.some((item) => normalizeClassId(item.lop_id) === normalizeClassId(sourceClassId))) {
      setSourceClassId(sourceClassOptions[0]?.lop_id || '');
    }
  }, [sourceClassOptions, sourceClassId]);

  useEffect(() => {
    const available = targetClassOptions.filter((item) => normalizeClassId(item.lop_id) !== normalizeClassId(sourceClassId));
    if (!available.some((item) => normalizeClassId(item.lop_id) === normalizeClassId(targetClassId))) {
      setTargetClassId(available[0]?.lop_id || targetClassOptions[0]?.lop_id || '');
    }
  }, [targetClassOptions, targetClassId, sourceClassId]);

  const selectedClassCount = selectedClassIds.length || sourceClassesForPromotion.length;
  const selectedStudentCount = useMemo(() => accounts.filter((item) => item.vai_tro === 'student' && selectedGrades.includes(normalizeGrade(item.khoi)) && matchesYear(item.nam_hoc, sourceYear)).length, [accounts, selectedGrades, sourceYear]);

  const targetYearOptions = useMemo(() => schoolYears
    .map(getSchoolYearName)
    .filter(Boolean)
    .filter((year) => year !== sourceYear), [schoolYears, sourceYear]);

  useEffect(() => {
    if (!isOpen) return;
    if (targetYearOptions.length && !targetYearOptions.includes(targetYear)) {
      setTargetYear(getDefaultTargetYear(schoolYears, sourceYear));
    }
    if (!targetYearOptions.length && targetYear) setTargetYear('');
  }, [isOpen, schoolYears, sourceYear, targetYear, targetYearOptions]);

  if (!isOpen) return null;

  const sourceClass = classes.find((item) => normalizeClassId(item.lop_id) === normalizeClassId(sourceClassId));
  const targetClass = classes.find((item) => normalizeClassId(item.lop_id) === normalizeClassId(targetClassId));

  const filterStudent = (student: Account, classId: string, query: string) => {
    const q = query.trim().toLowerCase();
    const sameClass = student.vai_tro === 'student' && normalizeClassId(student.lop_id || '') === normalizeClassId(classId) && matchesYear(student.nam_hoc, moveYear);
    if (!sameClass) return false;
    if (!q) return true;
    return [student.ho_ten, student.ma_hoc_sinh, student.ten_dang_nhap, student.user_id].some((value) => String(value || '').toLowerCase().includes(q));
  };

  const sourceStudents = accounts.filter((item) => filterStudent(item, sourceClassId, sourceQuery)).sort((a, b) => String(a.ho_ten || '').localeCompare(String(b.ho_ten || ''), 'vi'));
  const targetStudents = accounts.filter((item) => filterStudent(item, targetClassId, targetQuery)).sort((a, b) => String(a.ho_ten || '').localeCompare(String(b.ho_ten || ''), 'vi'));

  const toggleGrade = (grade: string) => {
    setSelectedGrades((current) => current.includes(grade) ? current.filter((item) => item !== grade) : [...current, grade]);
  };

  const toggleClass = (id: string) => {
    setSelectedClassIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllPromotionClasses = () => {
    const allIds = sourceClassesForPromotion.map((item) => item.lop_id);
    setSelectedClassIds(selectedClassIds.length === allIds.length ? [] : allIds);
  };

  const handleTransferClasses = () => {
    const classIds = selectedClassIds.length ? selectedClassIds : sourceClassesForPromotion.map((item) => item.lop_id);
    if (!sourceYear || !targetYear || sourceYear === targetYear || !classIds.length) return;
    onSubmit({
      source_nam_hoc: sourceYear,
      target_nam_hoc: targetYear,
      grade_scope: selectedGrades,
      class_ids: classIds,
      include_classes: true,
      include_students: includeStudents,
      graduate_final_grade: graduateFinalGrade,
      set_target_current: setTargetCurrent,
      archive_source_classes: archiveSourceClasses,
    });
  };

  const moveStudents = async (direction: 'right' | 'left') => {
    if (!onMoveStudents || moveSubmitting) return;
    const from = direction === 'right' ? sourceClassId : targetClassId;
    const to = direction === 'right' ? targetClassId : sourceClassId;
    const ids = direction === 'right' ? selectedSourceStudentIds : selectedTargetStudentIds;
    if (!from || !to || from === to || !ids.length) return;
    setMoveSubmitting(true);
    const ok = await onMoveStudents({ source_lop_id: from, target_lop_id: to, user_ids: ids, school_year: moveYear });
    setMoveSubmitting(false);
    if (ok) {
      setSelectedSourceStudentIds([]);
      setSelectedTargetStudentIds([]);
    }
  };

  const toggleSourceStudent = (id: string) => setSelectedSourceStudentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleTargetStudent = (id: string) => setSelectedTargetStudentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <div className="fixed inset-0 z-[13000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                <ArrowRightLeft className="h-4 w-4" /> Kết chuyển và chuyển lớp
              </p>
              <h3 className="mt-2 text-2xl font-black">Quản lý kết chuyển lớp học, học sinh theo năm học</h3>
              <p className="mt-1 max-w-3xl text-sm text-white/85">Thiết kế lại theo dạng 2 bảng đối chiếu: lớp năm học nguồn - năm học đích và chuyển học sinh giữa hai lớp.</p>
            </div>
            <button onClick={onClose} disabled={isSubmitting || moveSubmitting} className="rounded-full bg-white/15 p-2 hover:bg-white/25 disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 px-6 pt-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setActiveTab('classes')} className={`rounded-t-2xl px-5 py-3 text-sm font-black ${activeTab === 'classes' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-white/60'}`}>Kết chuyển lớp học</button>
            <button type="button" onClick={() => setActiveTab('students')} className={`rounded-t-2xl px-5 py-3 text-sm font-black ${activeTab === 'students' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-white/60'}`}>Chuyển lớp học</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {activeTab === 'classes' ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <div className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto]">
                  <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Năm học nguồn</span><select value={sourceYear} onChange={(e) => setSourceYear(e.target.value)} disabled={isSubmitting} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400">{schoolYears.map((item) => <option key={item.nam_hoc_id || item.ten_nam_hoc} value={item.ten_nam_hoc}>{item.ten_nam_hoc}</option>)}</select></label>
                  <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Năm học đích</span><select value={targetYear} onChange={(e) => setTargetYear(e.target.value)} disabled={isSubmitting || !targetYearOptions.length} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-100">{targetYearOptions.length ? targetYearOptions.map((year) => <option key={year} value={year}>{year}</option>) : <option value="">Chưa có năm học đích</option>}</select><span className="block text-xs font-semibold text-slate-500">Chỉ chọn từ năm học đã tạo trong Cấu hình năm học.</span></label>
                  <div className="flex items-end"><button type="button" onClick={toggleAllPromotionClasses} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"><RefreshCw className="h-4 w-4" /> {selectedClassIds.length ? 'Bỏ chọn' : 'Chọn lớp'}</button></div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="font-black text-slate-900">Chọn khối cần kết chuyển</h4>
                    <div className="flex flex-wrap gap-2">{availableGrades.map((grade) => <button key={grade} type="button" onClick={() => toggleGrade(grade)} disabled={isSubmitting} className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${selectedGrades.includes(grade) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Khối {grade}</button>)}</div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="bg-slate-50 px-4 py-3 text-center font-black text-slate-900">Năm học {sourceYear || '-'}</div>
                    <div className="max-h-[440px] overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-slate-500 shadow-sm"><tr><th className="w-10 px-3 py-3"></th><th className="w-12 px-2 py-3 text-left">STT</th><th className="px-2 py-3 text-left">Tên lớp</th><th className="px-2 py-3 text-left">Môn học</th><th className="w-14 px-2 py-3 text-left">KC</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {sourceClassesForPromotion.map((cls, index) => {
                            const checked = selectedClassIds.includes(cls.lop_id);
                            const nextName = deriveNextName(cls.ten_lop, cls.khoi);
                            return <tr key={cls.lop_id} className={checked ? 'bg-indigo-50' : 'hover:bg-slate-50'}><td className="px-3 py-2"><input type="checkbox" checked={checked} onChange={() => toggleClass(cls.lop_id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /></td><td className="px-2 py-2 text-slate-500">{index + 1}</td><td className="px-2 py-2"><div className="font-bold text-slate-900">{cls.ten_lop}</div><div className="text-xs text-slate-500">{cls.lop_id} • Khối {cls.khoi}</div></td><td className="px-2 py-2 text-slate-500">Theo bài học</td><td className="px-2 py-2"><div className="flex items-center gap-1 text-indigo-600"><ArrowRight className="h-4 w-4" /><span className="text-xs font-bold">{nextName || 'Ra trường'}</span></div></td></tr>;
                          })}
                          {!sourceClassesForPromotion.length && <tr><td colSpan={5} className="px-4 py-10 text-center font-semibold text-slate-400">Không có lớp phù hợp ở năm học nguồn.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="bg-slate-50 px-4 py-3 text-center font-black text-slate-900">Năm học {targetYear || '-'}</div>
                    <div className="max-h-[440px] overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-slate-500 shadow-sm"><tr><th className="w-12 px-3 py-3 text-left">STT</th><th className="px-2 py-3 text-left">Tên lớp</th><th className="px-2 py-3 text-left">Sửa</th><th className="px-2 py-3 text-left">Môn học</th><th className="px-2 py-3 text-left">Trạng thái</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {targetClassesForPromotion.map((cls, index) => <tr key={cls.lop_id} className="hover:bg-slate-50"><td className="px-3 py-2 text-slate-500">{index + 1}</td><td className="px-2 py-2"><div className="font-bold text-slate-900">{cls.ten_lop}</div><div className="text-xs text-slate-500">{cls.lop_id} • Khối {cls.khoi}</div></td><td className="px-2 py-2 text-sky-500">✎</td><td className="px-2 py-2 text-slate-500">Theo bài học</td><td className="px-2 py-2"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{statusLabel(cls.trang_thai)}</span></td></tr>)}
                          {!targetClassesForPromotion.length && <tr><td colSpan={5} className="px-4 py-10 text-center font-semibold text-slate-400">Chưa có lớp ở năm học đích. Nhấn kết chuyển để tạo lớp.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <h4 className="font-black text-slate-900">Tùy chọn kết chuyển</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={includeStudents} onChange={(e) => setIncludeStudents(e.target.checked)} disabled={isSubmitting} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600" /><span><b>Kết chuyển học sinh theo lớp</b><br /><span className="font-normal text-slate-500">Nếu bật, học sinh lớp nguồn được chuyển lên lớp đích tương ứng.</span></span></label>
                    <label className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={graduateFinalGrade} onChange={(e) => setGraduateFinalGrade(e.target.checked)} disabled={isSubmitting} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600" /><span><b>Khối 9 chuyển ra trường</b><br /><span className="font-normal text-slate-500">Không tạo lớp 10, tạm khóa học sinh cuối cấp nếu kết chuyển học sinh.</span></span></label>
                    <label className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={setTargetCurrent} onChange={(e) => setSetTargetCurrent(e.target.checked)} disabled={isSubmitting} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600" /><span><b>Đặt năm học đích làm hiện hành</b><br /><span className="font-normal text-slate-500">Dữ liệu mới sẽ mặc định theo năm học đích.</span></span></label>
                    <label className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={archiveSourceClasses} onChange={(e) => setArchiveSourceClasses(e.target.checked)} disabled={isSubmitting} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600" /><span><b>Tạm khóa lớp nguồn</b><br /><span className="font-normal text-slate-500">Chỉ dùng khi đã chốt xong năm học cũ.</span></span></label>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl bg-indigo-50 p-5 text-indigo-900">
                  <div className="flex items-center gap-3"><GraduationCap className="h-6 w-6" /><h4 className="font-black">Dữ liệu dự kiến</h4></div>
                  <div className="mt-5 grid gap-3"><div className="rounded-2xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-indigo-400">Lớp sẽ xử lý</p><p className="mt-1 text-3xl font-black">{selectedClassCount}</p></div><div className="rounded-2xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Học sinh theo khối đã chọn</p><p className="mt-1 text-3xl font-black">{selectedStudentCount}</p></div></div>
                </div>
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800"><b>Lưu ý:</b> Kết chuyển không xóa điểm và tiến trình cũ. Năm học đích phải được tạo sẵn trong Cấu hình năm học, hệ thống không cho nhập tay để tránh sai lệch dữ liệu.</div>
                {!targetYearOptions.length && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">Chưa có năm học đích để kết chuyển. Vui lòng tạo năm học mới trong Cấu hình năm học trước.</div>}
                <button onClick={handleTransferClasses} disabled={isSubmitting || !sourceYear || !targetYear || sourceYear === targetYear || !targetYearOptions.length || !sourceClassesForPromotion.length} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isSubmitting ? 'Đang kết chuyển...' : 'Kết chuyển lớp đã chọn'}</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
                <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Năm học</span><select value={moveYear} onChange={(e) => setMoveYear(e.target.value)} disabled={moveSubmitting} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400">{schoolYears.map((item) => <option key={item.nam_hoc_id || item.ten_nam_hoc} value={item.ten_nam_hoc}>{item.ten_nam_hoc}</option>)}</select></label>
                <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Khối nguồn</span><select value={sourceGrade} onChange={(e) => setSourceGrade(e.target.value)} disabled={moveSubmitting} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400">{availableGrades.map((grade) => <option key={grade} value={grade}>Khối {grade}</option>)}</select></label>
                <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Lớp nguồn</span><select value={sourceClassId} onChange={(e) => setSourceClassId(e.target.value)} disabled={moveSubmitting} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400">{sourceClassOptions.map((cls) => <option key={cls.lop_id} value={cls.lop_id}>{cls.ten_lop}</option>)}</select></label>
                <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Khối đích</span><select value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)} disabled={moveSubmitting} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400">{availableGrades.map((grade) => <option key={grade} value={grade}>Khối {grade}</option>)}</select></label>
                <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Lớp đích</span><select value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)} disabled={moveSubmitting} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400">{targetClassOptions.filter((cls) => normalizeClassId(cls.lop_id) !== normalizeClassId(sourceClassId)).map((cls) => <option key={cls.lop_id} value={cls.lop_id}>{cls.ten_lop}</option>)}</select></label>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
                <div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={sourceQuery} onChange={(e) => setSourceQuery(e.target.value)} placeholder="Tìm học sinh lớp nguồn..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-400" /></div>
                <div className="hidden items-center justify-center md:flex"><Users className="h-5 w-5 text-slate-400" /></div>
                <div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={targetQuery} onChange={(e) => setTargetQuery(e.target.value)} placeholder="Tìm học sinh lớp đích..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-400" /></div>
              </div>

              <div className="grid min-h-0 gap-4 xl:grid-cols-[1fr_auto_1fr]">
                <StudentTable title="Lớp nguồn" grade={sourceClass?.khoi} className={sourceClass?.ten_lop} students={sourceStudents} selectedIds={selectedSourceStudentIds} onToggle={toggleSourceStudent} onToggleAll={() => setSelectedSourceStudentIds(selectedSourceStudentIds.length === sourceStudents.length ? [] : sourceStudents.map((item) => item.user_id))} />
                <div className="flex flex-row items-center justify-center gap-3 xl:flex-col">
                  <button type="button" onClick={() => moveStudents('right')} disabled={moveSubmitting || !selectedSourceStudentIds.length || !sourceClassId || !targetClassId || sourceClassId === targetClassId} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-50">{moveSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsRight className="h-5 w-5" />} Chuyển</button>
                  <button type="button" onClick={() => moveStudents('left')} disabled={moveSubmitting || !selectedTargetStudentIds.length || !sourceClassId || !targetClassId || sourceClassId === targetClassId} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><ChevronsLeft className="h-5 w-5" /> Chuyển lại</button>
                </div>
                <StudentTable title="Lớp đích" grade={targetClass?.khoi} className={targetClass?.ten_lop} students={targetStudents} selectedIds={selectedTargetStudentIds} onToggle={toggleTargetStudent} onToggleAll={() => setSelectedTargetStudentIds(selectedTargetStudentIds.length === targetStudents.length ? [] : targetStudents.map((item) => item.user_id))} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 text-xs font-semibold text-slate-500">
          <span>{activeTab === 'classes' ? 'Kết chuyển lớp theo năm học mới.' : 'Chọn học sinh và bấm Chuyển/Chuyển lại để đổi lớp.'}</span>
          <button onClick={onClose} disabled={isSubmitting || moveSubmitting} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">Đóng</button>
        </div>
      </div>
    </div>
  );
}
