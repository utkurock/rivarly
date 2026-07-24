import React, { useMemo } from 'react';
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../contexts/ThemeContext';

export interface PricePoint {
  ts: number;
  price: number; // 0..1 probability
}

interface Props {
  points: PricePoint[];
  /** Current YES probability (0..1), used as the baseline when history is thin. */
  probability: number;
  /** Market creation time, so a single data point still draws a line. */
  createdAt?: number | null;
  height?: number;
}

const UP = '#10b981';
const DOWN = '#f43f5e';

const pct = (p: number): string => `${Math.round(p * 100)}%`;

const fmtTime = (t: number): string => {
  const d = new Date(t);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// The YES probability over time, styled like the rest of the app: tinted area,
// right-hand axis, dashed line at the current level, no third-party chrome.
const MarketPriceChart: React.FC<Props> = ({ points, probability, createdAt, height = 260 }) => {
  const { theme } = useTheme();

  // A market with a single price (or none) still deserves a readable line, so
  // the series is anchored at creation and carried through to now.
  const { series, isPlaceholder } = useMemo(() => {
    const clean = points
      .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price))
      .sort((a, b) => a.ts - b.ts);

    if (clean.length >= 2) return { series: clean, isPlaceholder: false };

    const now = Date.now();
    const start = createdAt && createdAt < now ? createdAt : now - 60 * 60 * 1000;
    const first = clean[0];
    return {
      series: first
        ? [{ ts: Math.min(start, first.ts), price: first.price }, { ts: now, price: probability }]
        : [{ ts: start, price: probability }, { ts: now, price: probability }],
      isPlaceholder: clean.length === 0,
    };
  }, [points, probability, createdAt]);

  const first = series[0].price;
  const last = series[series.length - 1].price;
  const color = isPlaceholder ? (theme === 'dark' ? '#6b7280' : '#9ca3af') : last >= first ? UP : DOWN;
  const axisColor = theme === 'dark' ? '#6b7280' : '#9ca3af';
  const gradientId = `market-fill-${color.replace('#', '')}`;

  return (
    <div style={{ width: '100%', height }} className="relative">
      {isPlaceholder && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="px-3 py-1.5 rounded-full bg-background-hover border border-border-default text-xs text-text-tertiary">
            No trades yet — the line starts with the first prediction
          </span>
        </div>
      )}

      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={isPlaceholder ? 0.12 : 0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtTime}
            tick={{ fill: axisColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={56}
            interval="preserveStartEnd"
          />
          <YAxis
            orientation="right"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => pct(v)}
            tick={{ fill: axisColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: axisColor, strokeDasharray: '3 3', strokeOpacity: 0.5 }}
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as PricePoint;
              return (
                <div className="bg-background-body border border-border-default rounded-lg px-2.5 py-1.5 shadow-lg">
                  <div className="text-xs font-bold text-text-primary tabular-nums">{pct(p.price)} YES</div>
                  <div className="text-[10px] text-text-tertiary">
                    {new Date(p.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            }}
          />

          <ReferenceLine y={last} stroke={color} strokeDasharray="4 4" strokeOpacity={0.5} />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: 'transparent' }}
          />
          {!isPlaceholder && (
            <ReferenceDot x={series[series.length - 1].ts} y={last} r={3.5} fill={color} stroke="none" />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MarketPriceChart;
