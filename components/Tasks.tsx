import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet } from '../contexts/StellarWalletContext';
import { TASKS, type TaskDef } from '../services/taskCatalog';
import { subscribeToCompletedTasks, completeTask, TaskError } from '../services/taskService';
import { subscribeToPoints, type PointsData } from '../services/pointsService';
import { submitTaskTx, ClaimTxError } from '../services/stellarTx';
import { WalletPicker } from './WalletButton';

const fmt = (n: number) => n.toLocaleString('en-US');

// A distinct icon per task, matching the sidebar nav's line-icon style. The X
// task uses the brand glyph (filled) so it reads instantly.
const TASK_ICONS: Record<string, React.ReactNode> = {
  'send-tx': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  ),
  'visit-ecosystem': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  'read-news': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
    </svg>
  ),
  'post-social': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  'follow-x': (
    <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
};

const TaskIcon: React.FC<{ id: string }> = ({ id }) => (
  <>{TASK_ICONS[id] ?? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M11 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  )}</>
);

const TaskRow: React.FC<{
  task: TaskDef;
  done: boolean;
  started: boolean;
  busy: boolean;
  onStart: () => void;
  onClaim: () => void;
}> = ({ task, done, started, busy, onStart, onClaim }) => {
  const button = () => {
    if (done) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-semibold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </span>
      );
    }
    if (task.type === 'onchain') {
      return (
        <button
          onClick={onClaim}
          disabled={busy}
          className="px-3.5 h-9 flex items-center gap-2 rounded-lg bg-white hover:bg-gray-200 text-[#0b0c0e] text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {busy && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#0b0c0e]" />}
          {busy ? 'Confirming…' : task.cta}
        </button>
      );
    }
    // visit / link: start first, then claim.
    if (!started) {
      return (
        <button
          onClick={onStart}
          className="px-3.5 h-9 flex items-center rounded-lg bg-white hover:bg-gray-200 text-[#0b0c0e] text-sm font-semibold transition-colors"
        >
          {task.cta}
        </button>
      );
    }
    return (
      <button
        onClick={onClaim}
        disabled={busy}
        className="px-3.5 h-9 flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {busy && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
        {busy ? 'Claiming…' : `Claim +${task.points}`}
      </button>
    );
  };

  return (
    <div className={`group bg-[#141519] rounded-2xl border shadow-sm transition-all p-5 ${done ? 'border-emerald-500/20' : 'border-[#262830] hover:border-[#33353d] hover:shadow-md'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#1c1d22] text-[#9b9ca4]'}`}>
          <TaskIcon id={task.id} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-[#ececee]">{task.title}</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-xs font-semibold">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
              </svg>
              +{task.points}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-[#9b9ca4] leading-relaxed">{task.description}</p>
        </div>

        <div className="flex-shrink-0 self-center">{button()}</div>
      </div>
    </div>
  );
};

const Tasks: React.FC = () => {
  const { user } = useFirebase();
  const { address, signTransaction } = useStellarWallet();
  const navigate = useNavigate();

  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState<PointsData | null>(null);
  const [started, setStarted] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) { setCompleted(new Set()); setPoints(null); return; }
    const unsubTasks = subscribeToCompletedTasks(user.uid, setCompleted);
    const unsubPoints = subscribeToPoints(user.uid, setPoints);
    return () => { unsubTasks(); unsubPoints(); };
  }, [user?.uid]);

  // "Started" (visit/link) state persists across navigation so a returning user
  // sees the Claim button instead of the initial CTA. Keyed per user.
  const startedKey = user?.uid ? `starcast:tasksStarted:${user.uid}` : null;
  useEffect(() => {
    if (!startedKey) { setStarted(new Set()); return; }
    try {
      const raw = localStorage.getItem(startedKey);
      setStarted(new Set(raw ? JSON.parse(raw) : []));
    } catch { setStarted(new Set()); }
  }, [startedKey]);

  const doneCount = useMemo(() => TASKS.filter((t) => completed.has(t.id)).length, [completed]);
  const totalReward = useMemo(() => TASKS.reduce((s, t) => s + t.points, 0), []);

  const flashMsg = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 3500); };

  const handleStart = (task: TaskDef) => {
    setStarted((s) => {
      const next = new Set(s).add(task.id);
      if (startedKey) { try { localStorage.setItem(startedKey, JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
    if (task.type === 'link' && task.href) {
      window.open(task.href, '_blank', 'noopener,noreferrer');
    } else if (task.type === 'visit' && task.route) {
      navigate(task.route);
    }
  };

  const handleClaim = async (task: TaskDef) => {
    if (!user?.uid || busyId) return;
    setError(null);

    // On-chain task needs a wallet + a signed tx first.
    if (task.type === 'onchain' && !address) { setPickerOpen(true); return; }

    setBusyId(task.id);
    try {
      let txHash: string | undefined;
      if (task.type === 'onchain') {
        txHash = await submitTaskTx(address!, user.uid, task.id, signTransaction);
      }
      const { awarded } = await completeTask(task.id, txHash);
      flashMsg(`+${fmt(awarded)} points earned!`);
    } catch (e) {
      setError(e instanceof ClaimTxError || e instanceof TaskError ? e.message : e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0c0e]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0b0c0e]/80 backdrop-blur border-b border-[#262830]">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-[#ececee]">Tasks</h1>
              <p className="text-sm text-[#9b9ca4] mt-0.5">
                {doneCount}/{TASKS.length} done · up to {fmt(totalReward)} points to earn
              </p>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1c1d22] text-[#ececee] border border-[#262830]">
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
              </svg>
              <span className="text-sm font-bold tabular-nums">{fmt(points?.points ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">
        {(flash || error) && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${flash ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {flash || error}
          </div>
        )}

        <div className="space-y-3">
          {TASKS.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              done={completed.has(task.id)}
              started={started.has(task.id)}
              busy={busyId === task.id}
              onStart={() => handleStart(task)}
              onClaim={() => handleClaim(task)}
            />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-[#6d6e77]">
          Points are awarded server-side. On-chain tasks are verified on Stellar.
        </p>
      </div>

      {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
};

export default Tasks;
