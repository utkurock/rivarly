import React from 'react';

interface LogoProps {
  /** Tailwind height class controlling the logo size (aspect ratio is preserved). */
  className?: string;
}

// The Starcast wordmark ("★cast"). Two artworks are shipped and swapped purely
// by the theme class on <html>: the cream mark on dark, the black mark on light.
// Using dark: variants (darkMode: 'class') means no JS and no flash on switch.
const Logo: React.FC<LogoProps> = ({ className = 'h-7' }) => (
  <span className={`inline-flex items-center ${className}`}>
    <img
      src="/starcastwhite.png"
      alt="Starcast"
      className="hidden dark:block h-full w-auto select-none"
      draggable={false}
    />
    <img
      src="/starcastblack.png"
      alt="Starcast"
      className="block dark:hidden h-full w-auto select-none"
      draggable={false}
    />
  </span>
);

export default Logo;
