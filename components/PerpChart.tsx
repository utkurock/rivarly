import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { fetchKlines, type Coin, type Interval } from '../services/pricesService';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  coin: Coin;
  interval: Interval;
  height?: number;
  /** Latest spot price, so the tail of the line tracks the ticker between polls. */
  livePrice?: number;
}

interface Point { t: number; p: number }

const fmtPrice = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(5);
};
const fmtAxisPrice = (n: number): string => {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
};
const fmtTime = (t: number): string =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// A clean, self-styled price chart for the Perp game — no third-party widget
// chrome. Area line tinted green/red by the window's direction, live tail,
// right-side price axis, hover tooltip. Theme-aware.
const PerpChart: React.FC<Props> = ({ coin, interval, height = 340, livePrice }) => {
  const { theme } = useTheme();
  const [data, setData] = useState<Point[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');

  // History refreshes on a timer; the live spot keeps the tail moving in
  // between. Poll spacing matches the server-side kline cache, so polling
  // faster would only return the same series.
  const POLL_MS = 15000;
  // First load can land while an upstream is rate-limiting or unreachable —
  // retry with a backoff instead of parking on "Chart unavailable".
  const RETRY_MS = [2000, 4000, 8000, 15000];

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let hasData = false;

    setState('loading');
    setData([]);

    const load = async () => {
      const candles = await fetchKlines(coin, interval, 90);
      if (cancelled) return;

      if (candles.length) {
        failures = 0;
        hasData = true;
        setData(candles.map((c) => ({ t: c.t, p: c.c })));
        setState('ready');
      } else if (!hasData) {
        // Nothing to show yet: stay in "loading" while retries are pending,
        // and only give up after the backoff is exhausted.
        failures += 1;
        setState(failures > RETRY_MS.length ? 'empty' : 'loading');
      }
      // With data already on screen a failed poll changes nothing — the last
      // known series stays up and the live tail keeps it current.

      const wait = candles.length || hasData ? POLL_MS : RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)];
      timer = setTimeout(load, wait);
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [coin, interval]);

  // Overlay the live spot onto the tail so the line tracks the ticker between
  // polls: the in-progress candle's close is exactly the current price.
  const series = useMemo(() => {
    if (!data.length || !livePrice || !Number.isFinite(livePrice)) return data;
    const copy = data.slice();
    copy[copy.length - 1] = { ...copy[copy.length - 1], p: livePrice };
    return copy;
  }, [data, livePrice]);

  const { color, domain, last } = useMemo(() => {
    if (!series.length) return { color: '#10b981', domain: ['auto', 'auto'] as [any, any], last: 0 };
    const prices = series.map((d) => d.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.15 || max * 0.0015;
    const first = series[0].p;
    const lastP = series[series.length - 1].p;
    return {
      color: lastP >= first ? '#10b981' : '#f43f5e',
      domain: [min - pad, max + pad] as [number, number],
      last: lastP,
    };
  }, [series]);

  const axisColor = theme === 'dark' ? '#6b7280' : '#9ca3af';

  if (state === 'loading' && !series.length) {
    return (
      <div style={{ height }} className="w-full flex items-center justify-center text-text-tertiary text-sm">
        Loading chart…
      </div>
    );
  }
  if (state === 'empty' || !series.length) {
    return (
      <div style={{ height }} className="w-full flex items-center justify-center text-text-tertiary text-sm">
        Chart unavailable
      </div>
    );
  }

  const gradientId = `perp-fill-${coin}-${color.replace('#', '')}`;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tickFormatter={fmtTime}
            tick={{ fill: axisColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={56}
            interval="preserveStartEnd"
          />
          <YAxis
            orientation="right"
            domain={domain}
            tickFormatter={fmtAxisPrice}
            tick={{ fill: axisColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={58}
            mirror={false}
          />
          <Tooltip
            cursor={{ stroke: axisColor, strokeDasharray: '3 3', strokeOpacity: 0.5 }}
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const pt = payload[0].payload as Point;
              return (
                <div className="bg-background-body border border-border-default rounded-lg px-2.5 py-1.5 shadow-lg">
                  <div className="text-xs font-bold text-text-primary tabular-nums">${fmtPrice(pt.p)}</div>
                  <div className="text-[10px] text-text-tertiary">{fmtTime(pt.t)}</div>
                </div>
              );
            }}
          />
          <ReferenceLine y={last} stroke={color} strokeDasharray="4 4" strokeOpacity={0.5} />
          {/* Live marker on the tail so the current price is visibly moving. */}
          <ReferenceDot x={series[series.length - 1].t} y={last} r={3.5} fill={color} stroke="none" />
          <Area
            type="monotone"
            dataKey="p"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: 'transparent' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PerpChart;
