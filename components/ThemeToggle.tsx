import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  /** 'full' shows a labelled row (sidebar); 'icon' is a compact square button (mobile header). */
  variant?: 'full' | 'icon';
  className?: string;
}

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'full', className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Light mode' : 'Dark mode';

  if (variant === 'icon') {
    return (
      <button
        onClick={toggleTheme}
        aria-label={label}
        title={label}
        className={`p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors ${className}`}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={label}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors ${className}`}
    >
      <span className="flex-shrink-0">{isDark ? <SunIcon /> : <MoonIcon />}</span>
      <span className="text-sm">{label}</span>
    </button>
  );
};

export default ThemeToggle;
