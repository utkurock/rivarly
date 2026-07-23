import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { getAllTimeLeaderboard, getDailyLeaderboard, type LeaderboardEntry } from '../services/leaderboardService';

const fmt = (n: number) => n.toLocaleString('en-US');
const MEDALS = ['🥇', '🥈', '🥉'];

const Avatar: React.FC<{ entry: LeaderboardEntry }> = ({ entry }) => {
  const [failed, setFailed] = useState(false);
  const hasImg = entry.avatar && !entry.avatar.startsWith('blob:') && !failed;
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-900 flex items-center justify-center flex-shrink-0">
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
    className={`flex items-center gap-3 px-4 py-3 transition-colors ${isMe ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
  >
    <div className="w-8 text-center flex-shrink-0">
      {rank <= 3 ? <span className="text-xl">{MEDALS[rank - 1]}</span> : <span className="text-sm font-bold text-gray-400">{rank}</span>}
    </div>
    <Avatar entry={entry} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-gray-900 truncate">{entry.username}</span>
        {isMe && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-900 text-white">You</span>}
      </div>
      {entry.handle && <span className="text-xs text-gray-400 truncate">@{entry.handle}</span>}
    </div>
    <div className="text-right flex-shrink-0">
      <div className="text-sm font-bold text-gray-900 tabular-nums">{fmt(entry.points)}</div>
      <div className="text-[10px] text-gray-400 -mt-0.5">points</div>
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
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Leaderboard</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {myRank ? `You're ranked #${myRank}` : 'Earn points with daily claims and predictions'}
              </p>
            </div>
            <div className="inline-flex p-1 bg-gray-100 rounded-full">
              {(['daily', 'alltime'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t === 'daily' ? 'Today' : 'All-time'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">
        {list === null ? (
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-8 h-4 bg-gray-200 rounded" />
                <div className="w-10 h-10 rounded-full bg-gray-200" />
                <div className="flex-1 h-3.5 bg-gray-200 rounded w-32" />
                <div className="w-12 h-4 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 text-3xl">🏆</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No rankings yet</h3>
            <p className="text-sm text-gray-500">
              {tab === 'daily' ? 'Be the first to earn points today.' : 'Claim daily rewards and make predictions to climb the board.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
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
