import React, { useEffect, useState } from 'react';
import {
  backfillMarketSlugs,
  fetchSlugStatus,
  type SlugBackfillResult,
  type SlugStatus,
} from '../services/adminMarketService';

// Admin panel for readable market links. New markets get a slug when they are
// created; markets that predate slugs are only reachable by document id until
// they are backfilled here, which needs the Admin SDK — Firestore rules let a
// client write only its own markets.
const MarketLinksPanel: React.FC = () => {
  const [status, setStatus] = useState<SlugStatus | null>(null);
  const [result, setResult] = useState<SlugBackfillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const load = async () => {
    try {
      setStatus(await fetchSlugStatus());
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not read market links.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (regenerate: boolean) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await backfillMarketSlugs(regenerate));
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not generate links.');
    } finally {
      setBusy(false);
      setConfirmRegenerate(false);
    }
  };

  return (
    <div className="bg-background-card border border-border-default rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Market links</h3>
          <p className="mt-1 text-sm text-text-secondary max-w-xl">
            Markets are shared as <span className="font-mono text-text-primary">/market/fed-cut-rates-september</span>.
            New ones get a link on creation; older ones fall back to their document id until they are generated here.
          </p>

          {status && (
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="text-text-secondary">
                <span className="font-bold text-text-primary">{status.withSlug}</span> of {status.total} linked
              </span>
              {status.missing > 0 ? (
                <span className="px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-400 text-xs font-semibold border border-amber-400/30">
                  {status.missing} missing
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-400/10 text-emerald-400 text-xs font-semibold border border-emerald-400/30">
                  All linked
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => run(false)}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />}
            Generate missing links
          </button>
          <button
            onClick={() => (confirmRegenerate ? run(true) : setConfirmRegenerate(true))}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              confirmRegenerate
                ? 'bg-base-red/15 text-base-red border border-base-red/40'
                : 'bg-background-hover hover:bg-background-active text-text-secondary'
            }`}
            title="Rewrites every market's link from its current title"
          >
            {confirmRegenerate ? 'Confirm: rewrite all links' : 'Regenerate all'}
          </button>
        </div>
      </div>

      {confirmRegenerate && !busy && (
        <p className="mt-3 text-xs text-base-red">
          Rewriting replaces links that are already shared — anything pointing at an old link stops resolving.
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-background-hover p-4">
          <p className="text-sm text-text-primary">
            <span className="font-bold">{result.updated}</span> link{result.updated === 1 ? '' : 's'} written ·{' '}
            {result.scanned} market{result.scanned === 1 ? '' : 's'} scanned
            {result.skipped > 0 && ` · ${result.skipped} skipped`}
          </p>
          {result.samples.length > 0 && (
            <ul className="mt-2 space-y-1 font-mono text-xs text-text-secondary">
              {result.samples.map((s) => (
                <li key={s.id}>/market/{s.slug}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-base-red">{error}</p>}
    </div>
  );
};

export default MarketLinksPanel;
