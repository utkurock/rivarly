import React, { useEffect, useMemo, useState } from 'react';
import { fetchEcosystemProjects, type EcosystemProject } from '../services/ecosystemService';

// Compact USD formatting for TVL, e.g. $1.2B, $340.5M, $12.3K.
const formatUSD = (n: number): string => {
  if (!n || n < 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
};

// A rounded, signed percentage with a colour cue.
const ChangeBadge: React.FC<{ value?: number }> = ({ value }) => {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  const up = value >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
};

// Letter-tile fallback when a logo is missing or fails to load.
const LogoFallback: React.FC<{ name: string }> = ({ name }) => (
  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background-hover to-border-default text-text-secondary font-bold">
    {name.charAt(0).toUpperCase()}
  </div>
);

const ProjectLogo: React.FC<{ project: EcosystemProject }> = ({ project }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-12 h-12 rounded-xl overflow-hidden border border-border-default bg-background-card flex-shrink-0">
      {project.logo && !failed ? (
        <img
          src={project.logo}
          alt={project.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <LogoFallback name={project.name} />
      )}
    </div>
  );
};

const ProjectCard: React.FC<{ project: EcosystemProject; rank: number }> = ({ project, rank }) => {
  const otherChains = project.chains.filter(c => c !== 'Stellar');
  return (
    <div className="group bg-background-card rounded-2xl border border-border-default shadow-sm hover:border-border-strong hover:shadow-md transition-all p-5">
      <div className="flex items-start gap-4">
        {/* Rank */}
        <div className="flex flex-col items-center pt-1 w-6 flex-shrink-0">
          <span className="text-sm font-bold text-text-tertiary">{rank}</span>
        </div>

        <ProjectLogo project={project} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-text-primary truncate">{project.name}</h3>
            {project.symbol && (
              <span className="text-xs font-medium text-text-tertiary">{project.symbol}</span>
            )}
            <span className="px-2 py-0.5 bg-background-hover text-text-secondary rounded-md text-xs font-medium">
              {project.category}
            </span>
          </div>

          {project.description && (
            <p className="mt-1.5 text-sm text-text-secondary leading-relaxed line-clamp-2">
              {project.description}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-3 flex items-center gap-4 flex-wrap text-sm">
            <div className="flex items-baseline gap-1.5">
              <span className="text-text-tertiary text-xs">TVL</span>
              <span className="font-semibold text-text-primary">{formatUSD(project.tvl)}</span>
              <ChangeBadge value={project.change1d} />
            </div>

            {otherChains.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span>Also on</span>
                <span className="text-text-secondary font-medium">
                  {otherChains.slice(0, 3).join(', ')}{otherChains.length > 3 ? ` +${otherChains.length - 3}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {project.twitter && (
            <a
              href={`https://x.com/${project.twitter}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-white hover:bg-background-hover transition-colors"
              aria-label={`${project.name} on X`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          )}
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 h-9 flex items-center rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors"
            >
              Visit
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const SkeletonCard: React.FC = () => (
  <div className="bg-background-card rounded-2xl border border-border-default p-5 animate-pulse">
    <div className="flex items-start gap-4">
      <div className="w-6" />
      <div className="w-12 h-12 rounded-xl bg-background-hover flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-40 bg-background-hover rounded" />
        <div className="h-3 w-full bg-background-card rounded" />
        <div className="h-3 w-24 bg-background-card rounded" />
      </div>
    </div>
  </div>
);

const Ecosystem: React.FC = () => {
  const [projects, setProjects] = useState<EcosystemProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      const data = await fetchEcosystemProjects();
      if (cancelled) return;
      setProjects(data);
      setFailed(data.length === 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Category tabs derived from the data, most-populated first.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach(p => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    return ['All', ...sorted];
  }, [projects]);

  const visible = useMemo(
    () => (activeCategory === 'All' ? projects : projects.filter(p => p.category === activeCategory)),
    [projects, activeCategory]
  );

  const totalTvl = useMemo(() => projects.reduce((sum, p) => sum + (p.tvl || 0), 0), [projects]);

  return (
    <div className="min-h-screen bg-background-body">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-background-body/80 backdrop-blur border-b border-border-default">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-text-primary">Stellar Ecosystem</h1>
              <p className="text-sm text-text-secondary mt-0.5">
                {loading ? 'Loading projects…'
                  : failed ? 'Directory unavailable'
                  : `${projects.length} projects · ${formatUSD(totalTvl)} total TVL`}
              </p>
            </div>
            <span className="text-xs text-text-tertiary">Data from DefiLlama</span>
          </div>

          {/* Category filter */}
          {!loading && !failed && categories.length > 1 && (
            <div className="mt-4 flex gap-2 overflow-x-auto ecosystem-tabs">
              {categories.map(cat => (
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
          )}
        </div>
      </div>

      {/* Hide the horizontal scrollbar under the category tabs (still scrollable). */}
      <style>{`
        .ecosystem-tabs { scrollbar-width: none; -ms-overflow-style: none; }
        .ecosystem-tabs::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : failed ? (
          <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 bg-background-hover rounded-2xl flex items-center justify-center mb-4 text-text-tertiary">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">Directory unavailable</h3>
            <p className="text-sm text-text-secondary">We couldn't reach the ecosystem data source right now. Please try again later.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((project, i) => (
              <ProjectCard key={project.id} project={project} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Ecosystem;
