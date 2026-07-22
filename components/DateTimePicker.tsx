import React, { useEffect, useMemo, useRef, useState } from 'react';

interface DateTimePickerProps {
  value: string; // 'YYYY-MM-DDTHH:mm' (local wall-clock) or ''
  onChange: (value: string) => void;
  min?: Date;
  max?: Date;
  placeholder?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const pad = (n: number) => String(n).padStart(2, '0');
const toValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const parseValue = (v: string): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const clamp = (d: Date, min?: Date, max?: Date) => {
  let t = d.getTime();
  if (min && t < min.getTime()) t = min.getTime();
  if (max && t > max.getTime()) t = max.getTime();
  return new Date(t);
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const DateTimePicker: React.FC<DateTimePickerProps> = ({ value, onChange, min, max, placeholder = 'Select date & time' }) => {
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => selected ?? min ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // When opening, jump the calendar to the currently-selected month (or min/today).
  useEffect(() => {
    if (open) setView(selected ?? min ?? new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const viewYear = view.getFullYear();
  const viewMonth = view.getMonth();

  // Monday-first 6x7 grid of dates covering the view month.
  const weeks = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const lead = (first.getDay() + 6) % 7; // days before the 1st (Mon=0)
    const grid: Date[][] = [];
    let cur = new Date(viewYear, viewMonth, 1 - lead);
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let d = 0; d < 7; d++) {
        row.push(cur);
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      }
      grid.push(row);
    }
    return grid;
  }, [viewYear, viewMonth]);

  const dayDisabled = (d: Date) => {
    if (min && endOfDay(d).getTime() < min.getTime()) return true;
    if (max && startOfDay(d).getTime() > max.getTime()) return true;
    return false;
  };

  const prevDisabled = !!min && endOfDay(new Date(viewYear, viewMonth, 0)).getTime() < min.getTime();
  const nextDisabled = !!max && startOfDay(new Date(viewYear, viewMonth + 1, 1)).getTime() > max.getTime();

  // Reference day for time-column enabling: the selected day (or min/today).
  const refDay = selected ?? min ?? new Date();
  const isMinDay = !!min && sameDay(refDay, min);
  const isMaxDay = !!max && sameDay(refDay, max);
  const hourDisabled = (h: number) => (isMinDay && h < min!.getHours()) || (isMaxDay && h > max!.getHours());
  const minuteDisabled = (m: number) => {
    const h = refDay.getHours();
    if (isMinDay && h === min!.getHours() && m < min!.getMinutes()) return true;
    if (isMaxDay && h === max!.getHours() && m > max!.getMinutes()) return true;
    return false;
  };

  const commit = (next: Date) => onChange(toValue(clamp(next, min, max)));

  const selectDay = (d: Date) => {
    if (dayDisabled(d)) return;
    const base = selected ?? min ?? new Date();
    commit(new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes()));
  };
  const selectHour = (h: number) => {
    if (hourDisabled(h)) return;
    const base = selected ?? min ?? new Date();
    commit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, base.getMinutes()));
  };
  const selectMinute = (m: number) => {
    if (minuteDisabled(m)) return;
    const base = selected ?? min ?? new Date();
    commit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), m));
  };

  const label = selected
    ? `${pad(selected.getDate())} ${MONTHS[selected.getMonth()].slice(0, 3)} ${selected.getFullYear()} · ${pad(selected.getHours())}:${pad(selected.getMinutes())}`
    : placeholder;

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border rounded-lg text-left transition-colors ${
          open ? 'border-black ring-1 ring-black/10' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-30 mt-2 w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl p-4 animate-dtp-in">
          <div className="flex gap-4">
            {/* Calendar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  disabled={prevDisabled}
                  onClick={() => setView(new Date(viewYear, viewMonth - 1, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="text-sm font-semibold text-gray-900">{MONTHS[viewMonth]} {viewYear}</div>
                <button
                  type="button"
                  disabled={nextDisabled}
                  onClick={() => setView(new Date(viewYear, viewMonth + 1, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map(d => (
                  <div key={d} className="h-7 flex items-center justify-center text-[11px] font-medium text-gray-400">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {weeks.flat().map((d, i) => {
                  const inMonth = d.getMonth() === viewMonth;
                  const disabled = dayDisabled(d);
                  const isSel = selected && sameDay(d, selected);
                  const isToday = sameDay(d, new Date());
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDay(d)}
                      className={`h-9 w-9 mx-auto flex items-center justify-center rounded-lg text-sm transition-colors ${
                        isSel
                          ? 'bg-black text-white font-semibold'
                          : disabled
                            ? 'text-gray-300 cursor-not-allowed'
                            : inMonth
                              ? 'text-gray-900 hover:bg-gray-100'
                              : 'text-gray-400 hover:bg-gray-100'
                      } ${!isSel && isToday ? 'ring-1 ring-gray-300' : ''}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time columns */}
            <div className="flex gap-2 border-l border-gray-100 pl-3">
              {([['H', HOURS, selectHour, hourDisabled, refDay.getHours()], ['M', MINUTES, selectMinute, minuteDisabled, refDay.getMinutes()]] as const).map(
                ([key, items, onPick, isDisabled, current]) => (
                  <div key={key} className="flex flex-col items-center">
                    <div className="text-[11px] font-medium text-gray-400 mb-1">{key === 'H' ? 'Hr' : 'Min'}</div>
                    <div className="h-[248px] w-11 overflow-y-auto dtp-scroll space-y-0.5 pr-1">
                      {(items as number[]).map(n => {
                        const active = selected && current === n;
                        const dis = (isDisabled as (n: number) => boolean)(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={dis}
                            onClick={() => (onPick as (n: number) => void)(n)}
                            className={`w-full py-1.5 rounded-md text-sm transition-colors ${
                              active
                                ? 'bg-black text-white font-semibold'
                                : dis
                                  ? 'text-gray-300 cursor-not-allowed'
                                  : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {pad(n)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { onChange(''); }}
              className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-black hover:bg-gray-800 text-white text-sm font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes dtp-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-dtp-in { animation: dtp-in 0.15s ease-out forwards; }
        .dtp-scroll::-webkit-scrollbar { width: 5px; }
        .dtp-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
        .dtp-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default DateTimePicker;
