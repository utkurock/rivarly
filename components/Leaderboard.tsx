import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { getAllTimeLeaderboard, getDailyLeaderboard, type LeaderboardEntry } from '../services/leaderboardService';

const fmt = (n: number) => n.toLocaleString('en-US');

// Gold / silver / bronze medal icon for the top 3; plain number otherwise.
const RANK_COLORS = ['#EAB308', '#94A3B8', '#B45309'];
const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank <= 3) {
    return (
      <svg className="w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke={RANK_COLORS[rank - 1]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </svg>
    );
  }
  return <span className="text-sm font-bold text-text-tertiary">{rank}</span>;
};

const TrophyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const Avatar: React.FC<{ entry: LeaderboardEntry }> = ({ entry }) => {
  const [failed, setFailed] = useState(false);
  const hasImg = entry.avatar && !entry.avatar.startsWith('blob:') && !failed;
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-background-active flex items-center justify-center flex-shrink-0">
      {hasImg ? (
        <img src={entry.avatar} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-white font-semibold text-sm">{entry.username.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
};

const Row: React.FC<{ entry: LeaderboardEntry; rank: number; isMe: boolean }> = ({ entry, rank, isMe }) => (
  <Link
    to={`/profile/${entry.uid}`}
    className={`flex items-center gap-3 px-4 py-3 transition-colors ${isMe ? 'bg-amber-500/10' : 'hover:bg-background-hover'}`}
  >
    <div className="w-8 text-center flex-shrink-0">
      <RankBadge rank={rank} />
    </div>
    <Avatar entry={entry} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-text-primary truncate">{entry.username}</span>
        {isMe && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-inverse text-inverse-ink">You</span>}
      </div>
      {entry.handle && <span className="text-xs text-text-tertiary truncate">@{entry.handle}</span>}
    </div>
    <div className="text-right flex-shrink-0">
      <div className="text-sm font-bold text-text-primary tabular-nums">{fmt(entry.points)}</div>
      <div className="text-[10px] text-text-tertiary -mt-0.5">points</div>
    </div>
  </Link>
);

const Leaderboard: React.FC = () => {
  const { user } = useFirebase();
  const [tab, setTab] = useState<'daily' | 'alltime'>('daily');
  const [daily, setDaily] = useState<LeaderboardEntry[] | null>(null);
  const [allTime, setAllTime] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (tab === 'daily' && daily === null) {
      getDailyLeaderboard().then((d) => { if (!cancelled) setDaily(d); });
    }
    if (tab === 'alltime' && allTime === null) {
      getAllTimeLeaderboard().then((d) => { if (!cancelled) setAllTime(d); });
    }
    return () => { cancelled = true; };
  }, [tab, daily, allTime]);

  const list = tab === 'daily' ? daily : allTime;
  const myRank = useMemo(() => {
    if (!list || !user?.uid) return null;
    const i = list.findIndex((e) => e.uid === user.uid);
    return i >= 0 ? i + 1 : null;
  }, [list, user?.uid]);

  return (
    <div className="min-h-screen bg-background-body">
      {/* Top bar — same layout as the Ecosystem page */}
      <div className="sticky top-0 z-20 bg-background-body/80 backdrop-blur border-b border-border-default">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Leaderboard</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {myRank ? `You're ranked #${myRank}` : 'Earn points with daily claims and predictions'}
            </p>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-2">
            {(['daily', 'alltime'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t ? 'bg-inverse text-inverse-ink' : 'bg-background-hover text-text-secondary hover:bg-background-active'
                }`}
              >
                {t === 'daily' ? 'Today' : 'All-time'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">
        {list === null ? (
          <div className="bg-background-card rounded-2xl border border-border-default divide-y divide-border-default">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-8 h-4 bg-background-hover rounded" />
                <div className="w-10 h-10 rounded-full bg-background-hover" />
                <div className="flex-1 h-3.5 bg-background-hover rounded w-32" />
                <div className="w-12 h-4 bg-background-hover rounded" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 bg-background-hover rounded-2xl flex items-center justify-center mb-4 text-text-tertiary">
              <TrophyIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">No rankings yet</h3>
            <p className="text-sm text-text-secondary">
              {tab === 'daily' ? 'Be the first to earn points today.' : 'Claim daily rewards and make predictions to climb the board.'}
            </p>
          </div>
        ) : (
          <div className="bg-background-card rounded-2xl border border-border-default shadow-sm overflow-hidden divide-y divide-border-default">
            {list.map((entry, i) => (
              <Row key={entry.uid} entry={entry} rank={i + 1} isMe={entry.uid === user?.uid} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
