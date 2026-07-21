import { useState, useEffect, useMemo } from 'react';

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
}

export function useCountdown(resolvesAt: string | number | null): CountdownResult {
  const target = useMemo(() => {
    if (!resolvesAt) return 0;
    const t = typeof resolvesAt === 'number' ? resolvesAt : new Date(resolvesAt).getTime();
    return Number.isFinite(t) ? t : 0;
  }, [resolvesAt]);

  const [countdown, setCountdown] = useState<CountdownResult>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
    totalSeconds: 0,
  });

  useEffect(() => {
    if (!target) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false, totalSeconds: 0 });
      return;
    }

    const calculateCountdown = () => {
      const now = Date.now();
      const difference = target - now;

      if (difference <= 0) {
        setCountdown({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
          totalSeconds: 0,
        });
        return;
      }

      const days = Math.floor(difference / 86400000);
      const hours = Math.floor((difference % 86400000) / 3600000);
      const minutes = Math.floor((difference % 3600000) / 60000);
      const seconds = Math.floor((difference % 60000) / 1000);

      setCountdown({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false,
        totalSeconds: Math.floor(difference / 1000),
      });
    };

    // Calculate immediately
    calculateCountdown();

    // Update every second
    const interval = window.setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [target]);

  return countdown;
}
