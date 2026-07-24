import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet } from '../contexts/StellarWalletContext';
import { useToast } from '../contexts/ToastContext';
import { subscribeToPoints } from '../services/pointsService';
import { subscribeToLaunches, subscribeToUserVotes, submitLaunch, castVote } from '../services/launchService';
import type { Launch, NewLaunch } from '../types';
import SubmitLaunchModal from './SubmitLaunchModal';

// Stake power mirrors the server (api/_launches.ts): every ballot counts at
// least 1, and points stack on top as extra weight.
const stakePower = (points: number): number => 1 + Math.max(0, Math.floor(points || 0));

const fmt = (n: number): string => n.toLocaleString('en-US');

// Firestore Timestamp | Date | millis — whatever the doc happens to carry.
const millis = (ts: unknown): number => {
  const t: any = ts;
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  return 0;
};

const timeAgo = (ts: unknown): string => {
  const ms = millis(ts);
  if (!ms) return '';
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const LogoTile: React.FC<{ launch: Launch }> = ({ launch }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-12 h-12 aspect-square rounded-xl overflow-hidden border border-border-default bg-background-body flex-shrink-0">
      {launch.logoUrl && !failed ? (
        <img src={launch.logoUrl} alt={launch.name} className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background-hover to-border-default text-text-secondary font-bold">
          {launch.name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
};

const UpvoteButton: React.FC<{ voted: boolean; weight: number; pending: boolean; onClick: () => void }> = ({ voted, weight, pending, onClick }) => (
  <button
    onClick={onClick}
    disabled={pending}
    aria-pressed={voted}
    className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border transition-colors flex-shrink-0 disabled:opacity-60 ${
      voted
        ? 'border-transparent bg-inverse text-inverse-ink'
        : 'border-border-default bg-background-body text-text-primary hover:border-border-strong'
    }`}
    title={voted ? 'Remove your stake' : 'Back this with your stake power'}
  >
    {pending ? (
      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
    ) : (
      <>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
        <span className="text-sm font-bold tabular-nums mt-0.5">{fmt(weight)}</span>
      </>
    )}
  </button>
);

// Top three get a medal tint; everyone else gets a plain numeral.
const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  const medal =
    rank === 1 ? 'bg-amber-400/15 text-amber-400 border-amber-400/30'
    : rank === 2 ? 'bg-slate-400/15 text-slate-300 border-slate-400/30'
    : rank === 3 ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    : 'bg-background-hover text-text-tertiary border-transparent';
  return (
    <span className={`inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-md border text-[11px] font-bold tabular-nums ${medal}`}>
      {rank}
    </span>
  );
};

const LaunchCard: React.FC<{
  launch: Launch;
  rank: number;
  voted: boolean;
  pending: boolean;
  onVote: (launch: Launch) => void;
}> = ({ launch, rank, voted, pending, onVote }) => {
  const host = hostOf(launch.url);
  return (
    <div className="group flex flex-col bg-background-card rounded-2xl border border-border-default hover:border-border-strong hover:shadow-md transition-all p-4 sm:p-5 h-full">
      <div className="flex items-start gap-3.5">
        <div className="relative flex-shrink-0">
          <LogoTile launch={launch} />
          <span className="absolute -top-1.5 -left-1.5">
            <RankBadge rank={rank} />
          </span>
        </div>

        <a
          href={launch.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-text-primary truncate group-hover:underline">{launch.name}</h3>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-background-hover text-text-secondary flex-shrink-0">{launch.category}</span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                launch.network === 'testnet'
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                  : 'border-base-green/30 bg-base-green/10 text-base-green'
              }`}
            >
              {launch.network === 'testnet' ? 'Testnet' : 'Mainnet'}
            </span>
          </div>
          <p className="text-sm text-text-secondary line-clamp-2 mt-0.5">{launch.tagline}</p>
          {host && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-text-tertiary truncate">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
              </svg>
              {host}
            </p>
          )}
        </a>

        <UpvoteButton voted={voted} weight={launch.voteWeight} pending={pending} onClick={() => onVote(launch)} />
      </div>

      {launch.description && (
        <p className="mt-3 text-sm text-text-secondary leading-relaxed line-clamp-2">{launch.description}</p>
      )}

      {launch.tags && launch.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {launch.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-background-hover text-text-tertiary">#{t}</span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3.5 flex items-center justify-between gap-3 text-[11px] text-text-tertiary">
        <div className="flex items-center gap-1.5 min-w-0">
          {launch.submitterProfile?.avatar ? (
            <img src={launch.submitterProfile.avatar} alt="" className="w-4 h-4 rounded-full object-cover" loading="lazy" />
          ) : (
            <span className="w-4 h-4 rounded-full bg-background-hover flex items-center justify-center text-[9px] font-bold text-text-tertiary">
              {(launch.submitterProfile?.username || 'A').charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate">{launch.submitterProfile?.username || 'Anonymous'}</span>
          {timeAgo(launch.createdAt) && (
            <>
              <span>·</span>
              <span className="whitespace-nowrap">{timeAgo(launch.createdAt)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          {launch.twitter && (
            <a
              href={`https://x.com/${launch.twitter}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-tertiary hover:text-text-primary transition-colors"
              aria-label={`${launch.name} on X`}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          )}
          {launch.github && (
            <a
              href={launch.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-tertiary hover:text-text-primary transition-colors"
              aria-label={`${launch.name} on GitHub`}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.2 1.9 1.2 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17.3 4.6 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 .3z" />
              </svg>
            </a>
          )}
          <span>{fmt(launch.voteWeight)} stake</span>
          <span>·</span>
          <span>{fmt(launch.voteCount)} {launch.voteCount === 1 ? 'backer' : 'backers'}</span>
        </div>
      </div>
    </div>
  );
};

const SkeletonCard: React.FC = () => (
  <div className="bg-background-card rounded-2xl border border-border-default p-4 sm:p-5 animate-pulse">
    <div className="flex items-start gap-3.5">
      <div className="w-12 h-12 rounded-xl bg-background-hover flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 bg-background-hover rounded" />
        <div className="h-3 w-full bg-background-hover rounded" />
      </div>
      <div className="w-14 h-14 rounded-xl bg-background-hover flex-shrink-0" />
    </div>
    <div className="mt-4 h-3 w-2/3 bg-background-hover rounded" />
  </div>
);

type SortKey = 'top' | 'new';

const Launches: React.FC = () => {
  const { user } = useFirebase();
  const { address, signTransaction } = useStellarWallet();
  const { addToast } = useToast();

  const [launches, setLaunches] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(true);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>('top');
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = subscribeToLaunches((data) => {
      setLaunches(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setVotedIds(new Set());
      setPoints(0);
      return;
    }
    const unsubVotes = subscribeToUserVotes(user.uid, setVotedIds);
    const unsubPoints = subscribeToPoints(user.uid, (p) => setPoints(p.points));
    return () => {
      unsubVotes();
      unsubPoints();
    };
  }, [user?.uid]);

  const myStake = useMemo(() => stakePower(points), [points]);

  // Category tabs derived from the data, most-populated first.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    launches.forEach((l) => counts.set(l.category, (counts.get(l.category) || 0) + 1));
    return ['All', ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)];
  }, [launches]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = launches.filter((l) => {
      if (activeCategory !== 'All' && l.category !== activeCategory) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.tagline.toLowerCase().includes(q) ||
        (l.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
    return sort === 'new'
      ? [...list].sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
      : [...list].sort((a, b) => b.voteWeight - a.voteWeight || b.voteCount - a.voteCount);
  }, [launches, activeCategory, search, sort]);

  const totalStake = useMemo(() => launches.reduce((sum, l) => sum + (l.voteWeight || 0), 0), [launches]);

  const handleVote = async (launch: Launch) => {
    if (pending) return;
    if (!user?.uid) {
      addToast({ type: 'info', title: 'Sign in first', message: 'Your session is still loading.' });
      return;
    }
    if (!address) {
      addToast({ type: 'info', title: 'Connect your wallet', message: 'Connect a Stellar wallet to vote.' });
      return;
    }
    setPending(launch.id);
    try {
      const r = await castVote(user.uid, address, launch.id, signTransaction);
      addToast({
        type: 'success',
        title: r.active ? 'Backed!' : 'Stake removed',
        message: r.active ? `You added ${fmt(r.weight)} stake power` : 'Your vote was withdrawn',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Vote failed', message: err?.message || 'Please try again.' });
    } finally {
      setPending(null);
    }
  };

  const handleSubmit = async (data: NewLaunch) => {
    try {
      await submitLaunch(data);
      addToast({ type: 'success', title: 'Launch submitted', message: 'Your product is now live for backing.' });
      setSort('new');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Submission failed', message: err?.message || 'Please try again.' });
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-background-body">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-background-body/80 backdrop-blur border-b border-border-default">
        <div className="max-w-[1600px] mx-auto px-3 md:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-text-primary">Launches</h1>
              <p className="text-sm text-text-secondary mt-0.5">
                {loading
                  ? 'Loading…'
                  : `${launches.length} ${launches.length === 1 ? 'product' : 'products'} · ${fmt(totalStake)} stake power backed`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {user?.uid && (
                <span className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-background-card border border-border-default text-xs text-text-tertiary">
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
                  </svg>
                  Stake power <span className="font-semibold text-text-secondary">{fmt(myStake)}</span>
                </span>
              )}
              <button
                onClick={() => setModalOpen(true)}
                className="px-3.5 h-9 flex items-center gap-1.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Submit
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto launch-tabs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat
                      ? 'bg-inverse text-inverse-ink'
                      : 'bg-background-hover text-text-secondary hover:bg-background-active'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="hidden md:block relative flex-shrink-0">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search launches"
                className="w-56 pl-9 pr-3 py-1.5 rounded-full bg-background-hover border border-transparent focus:border-border-strong text-sm text-text-primary placeholder-text-tertiary focus:outline-none transition-colors"
              />
            </div>

            <div className="flex-shrink-0 flex p-0.5 rounded-full bg-background-hover">
              {(['top', 'new'] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
                    sort === key ? 'bg-inverse text-inverse-ink' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hide the horizontal scrollbar under the category tabs (still scrollable). */}
      <style>{`
        .launch-tabs { scrollbar-width: none; -ms-overflow-style: none; }
        .launch-tabs::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Body */}
      <div className="max-w-[1600px] mx-auto px-3 md:px-6 py-4 md:py-6 pb-24 md:pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : launches.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 bg-background-hover rounded-2xl flex items-center justify-center mb-4 text-text-tertiary">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.65m5.96 5.72a14.926 14.926 0 01-5.841 2.58m-4.51-2.72a6 6 0 00-3.996 5.377 6 6 0 007.38-5.84m-3.384-.38a15 15 0 00-1.35-1.35" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">No launches yet</h3>
            <p className="text-sm text-text-secondary mb-4">Be the first to put a product in front of the community.</p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors"
            >
              Submit the first launch
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-lg font-semibold text-text-primary mb-1">Nothing matches</h3>
            <p className="text-sm text-text-secondary">Try a different category or clear your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
            {visible.map((launch, i) => (
              <LaunchCard
                key={launch.id}
                launch={launch}
                rank={i + 1}
                voted={votedIds.has(launch.id)}
                pending={pending === launch.id}
                onVote={handleVote}
              />
            ))}
          </div>
        )}
      </div>

      <SubmitLaunchModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
    </div>
  );
};

export default Launches;
