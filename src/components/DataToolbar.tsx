import { Search, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

interface FilterItem {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface DataToolbarProps {
  title: string;
  icon?: ReactNode;
  description: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters?: FilterItem[];
  action?: ReactNode;
  stats?: ReactNode;
  compact?: boolean;
  dense?: boolean;
}

export default function DataToolbar({
  title,
  icon,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  action,
  stats,
  compact = false,
  dense = false,
}: DataToolbarProps) {
  return (
    <div className={dense
      ? 'space-y-2 rounded-[18px] bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100'
      : compact
        ? 'space-y-3 rounded-[20px] bg-white p-4 shadow-sm ring-1 ring-slate-100'
        : 'space-y-4 rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:rounded-[28px] sm:p-6'}>
      {dense ? (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {icon ? (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-lg font-black text-slate-900 sm:text-xl">{title}</h1>
                {stats ? <div className="min-w-0">{stats}</div> : null}
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-slate-500 sm:text-xs">{description}</p>
            </div>
          </div>
          {action && <div className="max-w-full shrink-0 overflow-x-auto pb-0.5">{action}</div>}
        </div>
      ) : (
        <>
          <div className={`flex flex-col gap-3 ${compact ? 'xl:flex-row xl:items-center xl:justify-between' : 'lg:flex-row lg:items-start lg:justify-between'}`}>
            <div className="flex min-w-0 items-start gap-3">
              {icon ? (
                <div className={`flex shrink-0 items-center justify-center bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 ${compact ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-2xl'}`}>
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                <h1 className={compact ? 'text-xl font-black text-slate-900' : 'text-2xl font-bold text-slate-900 sm:text-[28px]'}>{title}</h1>
                <p className={`${compact ? 'mt-0.5 text-xs sm:text-sm' : 'mt-1 text-sm'} text-slate-500`}>{description}</p>
              </div>
            </div>
            {action && <div className="max-w-full shrink-0 overflow-x-auto pb-0.5">{action}</div>}
          </div>
          {stats && <div>{stats}</div>}
        </>
      )}

      <div className={dense
        ? filters.length <= 2
          ? 'grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-[minmax(320px,1.5fr)_repeat(2,minmax(150px,0.75fr))]'
          : 'grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.35fr)_repeat(5,minmax(126px,0.72fr))]'
        : compact
          ? 'grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.35fr)_repeat(5,minmax(132px,0.72fr))]'
          : 'grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.65fr))]'}>
        <label className={`group flex items-center gap-3 border border-slate-200 bg-slate-50 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 ${dense ? 'rounded-xl px-3 py-2' : compact ? 'rounded-xl px-3 py-2.5' : 'rounded-2xl px-4 py-3'}`}>
          <Search className="h-4 w-4 shrink-0 text-slate-400 transition group-focus-within:text-indigo-500" />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full min-w-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>

        {filters.map((filter) => (
          <label key={filter.key} className={`flex min-w-0 items-center gap-2 border border-slate-200 bg-slate-50 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 ${dense ? 'rounded-xl px-3 py-2' : compact ? 'rounded-xl px-3 py-2.5' : 'rounded-2xl px-4 py-3'}`}>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              className="w-full min-w-0 bg-transparent text-sm text-slate-700 outline-none"
              aria-label={filter.label}
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
