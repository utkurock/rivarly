import React, { useCallback, useEffect, useState } from 'react';
import { fetchStellarTweets, type Tweet } from '../services/tweetsService';
import TweetCard from './TweetCard';

const SkeletonTweet: React.FC = () => (
  <div className="px-6 py-4 border-b border-border-default animate-pulse">
    <div className="flex gap-3">
      <div className="h-11 w-11 rounded-full bg-background-active flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-40 bg-background-hover rounded" />
        <div className="h-3 w-full bg-background-hover rounded" />
        <div className="h-3 w-2/3 bg-background-hover rounded" />
      </div>
    </div>
  </div>
);

const StellarTweets: React.FC = () => {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setEmpty(false);
    const data = await fetchStellarTweets();
    setTweets(data);
    setEmpty(data.length === 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      {/* Sub-header: what this is + refresh */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-default">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="w-2 h-2 rounded-full bg-base-green animate-pulse" />
          <span>Live Stellar chatter from X</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div>{[...Array(6)].map((_, i) => <SkeletonTweet key={i} />)}</div>
      ) : empty ? (
        <div className="text-center py-20 px-6">
          <div className="mx-auto w-16 h-16 bg-background-hover rounded-2xl flex items-center justify-center mb-4 text-text-tertiary">
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">No tweets right now</h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            We couldn't load Stellar tweets. If this persists, the X feed may need an API key configured on the server.
          </p>
        </div>
      ) : (
        <div>
          {tweets.map((t) => (
            <TweetCard key={t.id} tweet={t} />
          ))}
        </div>
      )}
    </div>
  );
};

export default StellarTweets;
