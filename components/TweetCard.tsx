import React from 'react';
import type { Tweet } from '../services/tweetsService';

const compact = (n: number): string => {
  if (!n) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

const timeAgo = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const VerifiedBadge = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 text-base-blue flex-shrink-0" fill="currentColor" aria-label="Verified">
    <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
  </svg>
);

const Stat: React.FC<{ icon: React.ReactNode; value?: number }> = ({ icon, value }) => (
  <span className="flex items-center gap-1.5 text-text-tertiary text-xs">
    {icon}
    {value ? <span>{compact(value)}</span> : null}
  </span>
);

const Avatar: React.FC<{ tweet: Tweet }> = ({ tweet }) => {
  const [failed, setFailed] = React.useState(false);
  if (tweet.author.avatar && !failed) {
    return (
      <img
        src={tweet.author.avatar}
        alt={tweet.author.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-11 w-11 rounded-full object-cover ring-1 ring-border-default flex-shrink-0"
      />
    );
  }
  return (
    <div className="h-11 w-11 rounded-full bg-background-active flex items-center justify-center ring-1 ring-border-default flex-shrink-0 text-text-secondary font-bold">
      {(tweet.author.name || tweet.author.username || '?').charAt(0).toUpperCase()}
    </div>
  );
};

const TweetCard: React.FC<{ tweet: Tweet }> = ({ tweet }) => {
  const media = tweet.media.slice(0, 4);
  return (
    <a
      href={tweet.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-6 py-4 border-b border-border-default hover:bg-background-card transition-colors"
    >
      <div className="flex gap-3">
        <Avatar tweet={tweet} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-bold text-text-primary truncate max-w-[45%]">{tweet.author.name}</span>
            {tweet.author.verified && <VerifiedBadge />}
            {tweet.author.username && (
              <span className="text-text-tertiary truncate">@{tweet.author.username}</span>
            )}
            <span className="text-text-tertiary">·</span>
            <span className="text-text-tertiary flex-shrink-0">{timeAgo(tweet.createdAt)}</span>
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-text-tertiary ml-auto flex-shrink-0" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>

          {/* Text */}
          {tweet.text && (
            <p className="mt-1 text-[15px] leading-relaxed text-text-primary whitespace-pre-wrap break-words">
              {tweet.text}
            </p>
          )}

          {/* Media */}
          {media.length > 0 && (
            <div
              className={`mt-3 grid gap-1 rounded-2xl overflow-hidden border border-border-default ${
                media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
              }`}
            >
              {media.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  loading="lazy"
                  className={`w-full object-cover ${media.length === 1 ? 'max-h-[420px]' : 'h-40'}`}
                />
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="mt-3 flex items-center gap-6">
            <Stat
              value={tweet.replyCount}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.86L3 20l1.14-3.42A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
            />
            <Stat
              value={tweet.retweetCount}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4m14 0v2a4 4 0 01-4 4H3" />
                </svg>
              }
            />
            <Stat
              value={tweet.likeCount}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                </svg>
              }
            />
            {tweet.viewCount ? (
              <Stat
                value={tweet.viewCount}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178a1 1 0 010 .644C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </a>
  );
};

export default TweetCard;
