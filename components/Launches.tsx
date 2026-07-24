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

const LogoTile: React.FC<{ launch: Launch }> = ({ launch }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-12 h-12 rounded-xl overflow-hidden border border-border-default bg-background-card flex-shrink-0">
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
    className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl border transition-colors flex-shrink-0 disabled:opacity-60 ${
      voted
        ? 'border-transparent bg-inverse text-inverse-ink'
        : 'border-border-default bg-background-card text-text-primary hover:border-border-strong'
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

const LaunchCard: React.FC<{
  launch: Launch;
  rank: number;
  voted: boolean;
  pending: boolean;
  onVote: (launch: Launch) => void;
}> = ({ launch, rank, voted, pending, onVote }) => (
  <div className="group bg-background-card rounded-2xl border border-border-default hover:border-border-strong hover:shadow-md transition-all p-4 sm:p-5">
    <div className="flex items-center gap-4">
      <span className="w-6 text-center text-sm font-bold text-text-tertiary flex-shrink-0">{rank}</span>
      <LogoTile launch={launch} />

      <a href={launch.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-bold text-text-primary truncate group-hover:underline">{launch.name}</h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-background-hover text-text-secondary">{launch.category}</span>
        </div>
        <p className="text-sm text-text-secondary truncate mt-0.5">{launch.tagline}</p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-text-tertiary">
          <span>{fmt(launch.voteWeight)} stake power</span>
          <span>·</span>
          <span>{fmt(launch.voteCount)} {launch.voteCount === 1 ? 'backer' : 'backers'}</span>
        </div>
      </a>

      <UpvoteButton voted={voted} weight={launch.voteWeight} pending={pending} onClick={() => onVote(launch)} />
    </div>
  </div>
);

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
    } catch (err: any) {
      addToast({ type: 'error', title: 'Submission failed', message: err?.message || 'Please try again.' });
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-background-body">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-background-body/80 backdrop-blur border-b border-border-default">
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-text-primary">Launches</h1>
              <p className="text-sm text-text-secondary mt-0.5">
                {loading ? 'Loading…' : `${launches.length} products · ranked by community stake power`}
              </p>
            </div>
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

          {user?.uid && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-tertiary">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
              </svg>
              Your stake power: <span className="font-semibold text-text-secondary">{fmt(myStake)}</span> — each vote carries this weight, and voting never spends points.
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-background-card border border-border-default animate-pulse" />
            ))}
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
        ) : (
          <div className="space-y-3">
            {launches.map((launch, i) => (
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
