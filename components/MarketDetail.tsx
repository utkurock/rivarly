import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { looksLikeDocId, slugify } from '../utils/slug';
import { formatPoints } from '../utils/format';
import MarketPriceChart from './MarketPriceChart';
import { useQuery } from '@tanstack/react-query';
import { getPricePoints } from '../services/commentsService';
import { db } from '../firebase';
import type { Market } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { useFirebase } from '../contexts/FirebaseContext';

async function fetchMarketById(marketId: string): Promise<Market | null> {
  const snap = await getDoc(doc(db, 'markets', marketId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as Market : null;
}

async function fetchMarketBySlug(slug: string): Promise<Market | null> {
  try {
    const snap = await getDocs(query(collection(db, 'markets'), where('slug', '==', slug), limit(1)));
    const d = snap.docs[0];
    return d ? ({ id: d.id, ...(d.data() as any) }) as Market : null;
  } catch {
    return null;
  }
}

/**
 * The URL segment is either a readable slug or a document id. Markets created
 * before slugs existed are still linked by id, so both have to resolve — the
 * likely shape is tried first and the other is the fallback.
 */
async function fetchMarketByParam(param: string): Promise<Market | null> {
  if (looksLikeDocId(param)) return (await fetchMarketById(param)) || (await fetchMarketBySlug(param));
  return (await fetchMarketBySlug(param)) || (await fetchMarketById(param));
}

async function fetchComments(marketId: string) {
  try {
    const q = query(
      collection(db, 'comments'),
      where('marketId', '==', marketId),
      orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e: any) {
    console.warn('Comments query failed:', e?.message);
    return [];
  }
}

const MarketDetail: React.FC = () => {
  // Params first — this is a slug for markets that have one, an id otherwise.
  const { marketId: routeParam = '' } = useParams<{ marketId: string }>();
  const navigate = useNavigate();

  // Identity
  const { user, userProfile } = useFirebase();
  const userKey = userProfile?.uid ?? user?.uid ?? null;

  // Local state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [liveComments, setLiveComments] = useState<any[] | null>(null);
  const [livePrices, setLivePrices] = useState<any[] | null>(null);

  // Queries (stable order)
  const marketQ = useQuery({
    queryKey: ['market', routeParam],
    queryFn: () => fetchMarketByParam(routeParam),
    enabled: Boolean(routeParam),
    staleTime: 30000,
  });

  // Everything else keys off the real document id, never the URL segment.
  const marketId = marketQ.data?.id || '';
  const hasMarketId = Boolean(marketId);

  const commentsQ = useQuery({
    queryKey: ['comments', marketId],
    queryFn: () => fetchComments(marketId),
    enabled: hasMarketId,
    staleTime: 30000,
  });

  const pricesQ = useQuery({
    queryKey: ['prices', marketId],
    queryFn: () => getPricePoints(marketId),
    enabled: hasMarketId,
    staleTime: 30000,
  });

  // Derived
  const market = marketQ.data ?? null;
  const resolvesAtSafe = useMemo<number | null>(() => {
    if (!market?.resolvesAt) return null;
    const t = typeof market.resolvesAt === 'number' ? market.resolvesAt : new Date(market.resolvesAt).getTime();
    return Number.isFinite(t) ? t : null;
  }, [market?.resolvesAt]);

  const safeProbability = useMemo(() => {
    const p = (market as any)?.probability;
    return typeof p === 'number' && isFinite(p) ? p : 0.5;
  }, [market]);

  const toJsDate = (val: any): Date | null => {
    try {
      if (!val) return null;
      if (typeof val.toDate === 'function') return val.toDate();
      if (typeof val === 'number' || typeof val === 'string') return new Date(val);
      return null;
    } catch {
      return null;
    }
  };

  // Volume metrics from the market document
  const volume24h = useMemo(() => {
    return Number((market as any)?.metrics?.volume24hUSD || 0);
  }, [market]);

  const totalVolume = useMemo(() => {
    if ((market as any)?.metrics?.totalVolumeUSD) {
      return Number((market as any).metrics.totalVolumeUSD);
    }
    return Number((market as any)?.volumeUSD || 0);
  }, [market]);

  // Hooks always called
  const countdown = useCountdown(resolvesAtSafe);

  // Effects
  useEffect(() => {
    if (routeParam && marketQ.isError) setErrorMsg('Failed to load market.');
  }, [routeParam, marketQ.isError]);

  // Keep one canonical address per market: an id-based link swaps itself for
  // the readable one as soon as the document says it has a slug.
  useEffect(() => {
    const m = marketQ.data;
    if (m?.slug && routeParam !== m.slug) navigate(`/market/${m.slug}`, { replace: true });
  }, [marketQ.data, routeParam, navigate]);

  // Markets created before slugs existed pick one up the first time their
  // creator opens them; Firestore rules only let the owner write the document.
  useEffect(() => {
    const m = marketQ.data;
    if (!m || m.slug || !userKey || (m as any).creator !== userKey) return;
    const slug = slugify(m.title || m.question || '');
    if (!slug) return;
    let cancelled = false;
    (async () => {
      if (await fetchMarketBySlug(slug)) return; // already taken by another market
      if (cancelled) return;
      try {
        await updateDoc(doc(db, 'markets', m.id), { slug });
        if (!cancelled) navigate(`/market/${slug}`, { replace: true });
      } catch {
        // Not permitted or offline — the id link keeps working either way.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketQ.data, userKey, navigate]);

  // Live comments subscription so new comments appear immediately for everyone
  useEffect(() => {
    if (!hasMarketId) return;

    let unsubscribe: (() => void) | null = null;
    let isSubscribed = true;

    const qWithOrder = query(
      collection(db, 'comments'),
      where('marketId', '==', marketId),
      orderBy('timestamp', 'desc')
    );

    // Primary listener with orderBy (needs composite index)
    unsubscribe = onSnapshot(qWithOrder, (snap) => {
      if (!isSubscribed) return;
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setLiveComments(rows);
    }, () => {
      if (!isSubscribed) return;
      // Cleanup previous subscription before creating fallback
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      // Fallback: subscribe without order (no index required), then sort client-side
      const qSimple = query(collection(db, 'comments'), where('marketId', '==', marketId));
      unsubscribe = onSnapshot(qSimple, (snap2) => {
        if (!isSubscribed) return;
        const rows2 = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        rows2.sort((a: any, b: any) => {
          const ta = (toJsDate(a.timestamp) || toJsDate(a.createdAt) || new Date(0)).getTime();
          const tb = (toJsDate(b.timestamp) || toJsDate(b.createdAt) || new Date(0)).getTime();
          return tb - ta;
        });
        setLiveComments(rows2);
      });
    });

    return () => {
      isSubscribed = false;
      if (unsubscribe) unsubscribe();
    };
  }, [hasMarketId, marketId]);

  // Live prices subscription so chart updates immediately (with index fallback)
  useEffect(() => {
    if (!hasMarketId) return;

    let unsubscribe: (() => void) | null = null;
    let isSubscribed = true;

    const qPrices = query(collection(db, 'prices'), where('marketId', '==', marketId), orderBy('timestamp', 'asc'));
    unsubscribe = onSnapshot(qPrices, (snap) => {
      if (!isSubscribed) return;
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setLivePrices(rows);
    }, () => {
      if (!isSubscribed) return;
      // Cleanup previous subscription before creating fallback
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      // Fallback without orderBy (no index required); sort client-side
      const qSimple = query(collection(db, 'prices'), where('marketId', '==', marketId));
      unsubscribe = onSnapshot(qSimple, (snap2) => {
        if (!isSubscribed) return;
        const rows2 = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        rows2.sort((a: any, b: any) => {
          const ta = (toJsDate(a.timestamp) || new Date(0)).getTime();
          const tb = (toJsDate(b.timestamp) || new Date(0)).getTime();
          return ta - tb;
        });
        setLivePrices(rows2);
      }, () => {
        if (!isSubscribed) return;
        setLivePrices(null);
      });
    });

    return () => {
      isSubscribed = false;
      if (unsubscribe) unsubscribe();
    };
  }, [hasMarketId, marketId]);

  // Early renders AFTER hooks
  if (!hasMarketId) return <div className="p-6 text-white/70">Market ID missing.</div>;
  if (marketQ.isLoading) return <div className="p-6 text-white/70">Loading market…</div>;
  if (!market) return <div className="p-6 text-white/70">{errorMsg || 'Market not found.'}</div>;

  const chartPoints = (livePrices ?? pricesQ.data ?? [])
    .map((p: any) => {
      const d = typeof p?.timestamp?.toDate === 'function' ? p.timestamp.toDate() : new Date(p.timestamp);
      return { ts: d.getTime(), price: Number(p.price) };
    })
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price));

  const marketCreatedAt = toJsDate((market as any).createdAt)?.getTime() ?? null;

  // Move since the first recorded price, in percentage points. Null while the
  // market has no history to compare against.
  const priceChange =
    chartPoints.length > 0 ? Math.round((safeProbability - chartPoints[0].price) * 100) : null;

  const creatorProfile = (market as any).creatorProfile;
  const creatorName = creatorProfile?.username || 'Anonymous';

  return (
    <div className="min-h-screen bg-background-body text-text-primary">
      <div className="max-w-[1600px] mx-auto px-4 py-4 md:py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-white mb-4 md:mb-6 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Markets
        </Link>

        {/* Mobile: Flex column with custom order, Desktop: Grid layout */}
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_400px] gap-4 md:gap-6">
          {/* Left side content wrapper - Desktop only */}
          <div className="contents lg:block lg:space-y-4 lg:space-y-6 lg:min-w-0 lg:order-1">
            <div className="space-y-3 md:space-y-4">
              <div className="inline-flex items-center px-2 py-1 rounded-md bg-background-hover text-text-secondary text-xs md:text-sm font-medium">
                {market.category}
              </div>
              <h1 className="text-xl md:text-3xl font-semibold tracking-tight text-text-primary">{market.title || (market as any).question || 'Untitled Market'}</h1>
              <div className="flex items-center gap-4 text-sm text-text-secondary">
                <div className="flex items-center gap-2">
                  {/* Creator Avatar */}
                  {creatorProfile?.avatar && creatorProfile.avatar.trim() !== '' ? (
                    <img
                      src={creatorProfile.avatar}
                      alt={creatorName}
                      className="w-6 h-6 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-[10px]">
                        {creatorName.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span>Created by <span className="font-medium text-text-primary">{creatorName}</span></span>
                </div>
                <span className="w-1 h-1 bg-background-active rounded-full"></span>
                <div className={`px-2 py-1 rounded-md text-xs font-mono font-medium ${countdown.isExpired ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-background-hover text-text-secondary border border-border-default'}`}>
                  {countdown.isExpired ? '00:00:00:00' : `${String(countdown.days).padStart(2,'0')}:${String(countdown.hours).padStart(2,'0')}:${String(countdown.minutes).padStart(2,'0')}:${String(countdown.seconds).padStart(2,'0')}`}
                </div>
              </div>
            </div>

            {/* Price History Chart - Mobile order-1 */}
            <div className="rounded-xl bg-background-card border border-border-default p-4 md:p-5 shadow-sm order-1 lg:order-none">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-text-primary">Price history</h3>
                  <p className="text-xs text-text-tertiary mt-0.5">YES probability since the market opened</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-text-primary tabular-nums leading-none">
                    {Math.round(safeProbability * 100)}%
                  </div>
                  <div
                    className={`mt-1 text-xs font-semibold ${
                      priceChange === null
                        ? 'text-text-tertiary'
                        : priceChange >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {priceChange === null
                      ? 'No change yet'
                      : `${priceChange >= 0 ? '+' : ''}${priceChange}% since open`}
                  </div>
                </div>
              </div>
              <MarketPriceChart
                points={chartPoints}
                probability={safeProbability}
                createdAt={marketCreatedAt}
                height={260}
              />
            </div>

            {/* Details card split into Sources and Info - Mobile order-4 */}
            <div className="rounded-xl bg-background-card border border-border-default p-5 shadow-sm order-4 lg:order-none">
              <h3 className="text-lg font-semibold mb-4 text-text-primary">Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-text-secondary text-sm mb-2 font-medium">Sources</div>
                  {Array.isArray((market as any).sources) && (market as any).sources.length > 0 ? (
                    <div className="space-y-2">
                      {(market as any).sources.map((source: string, i: number) => (
                        <div key={i} className="p-2 bg-background-hover rounded-md break-all border border-border-default">
                          <a href={source} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{source}</a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-text-secondary text-sm">No sources provided.</div>
                  )}
                </div>
                <div>
                  <div className="text-text-secondary text-sm mb-2 font-medium">Info</div>
                  {(market as any).info ? (
                    <p className="text-text-secondary whitespace-pre-wrap leading-relaxed">{(market as any).info}</p>
                  ) : (
                    <div className="text-text-secondary text-sm">No description provided.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Comments - Mobile order-6 */}
            <div className="rounded-xl bg-background-card border border-border-default p-5 shadow-sm order-6 lg:order-none">
              <h3 className="text-lg font-semibold mb-4 text-text-primary">Comments</h3>
              {/* Input */}
              <div className="flex gap-3 mb-6">
                {/* User Avatar */}
                {userProfile?.avatar && userProfile.avatar.trim() !== '' ? (
                  <img
                    src={userProfile.avatar}
                    alt={userProfile.username || 'You'}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-[10px]">
                      {userProfile?.username?.slice(0, 2).toUpperCase() || '??'}
                    </span>
                  </div>
                )}
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="flex-1 px-3 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:border-border-strong focus:bg-background-card"
                  />
                  <button
                    onClick={async () => {
                      if (!userKey || !newComment.trim()) return;
                      try {
                        const { addComment } = await import('../services/commentsService');
                        await addComment(
                          market.id,
                          userKey,
                          newComment.trim(),
                          userProfile ? {
                            username: userProfile.username || 'Anonymous',
                            avatar: userProfile.avatar || '',
                          } : undefined
                        );
                        setNewComment('');
                        commentsQ.refetch();
                      } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error('Failed to post comment', e);
                      }
                    }}
                    disabled={!userKey || !newComment.trim()}
                    className="px-4 py-2 bg-inverse hover:bg-inverse-hover disabled:bg-background-active disabled:text-text-tertiary !text-inverse-ink rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              </div>
              {/* List */}
              <div className="space-y-4">
                {commentsQ.isLoading && !liveComments ? (
                  <p className="text-text-secondary text-center py-8">Loading comments...</p>
                ) : !(liveComments?.length ?? commentsQ.data?.length) ? (
                  <p className="text-text-secondary text-center py-8">No comments yet. Be the first to comment!</p>
                ) : (
                  (liveComments ?? commentsQ.data)?.map((comment: any) => {
                    const commentUserProfile = comment.userProfile;
                    const hasAvatar = commentUserProfile?.avatar && commentUserProfile.avatar.trim() !== '';

                    return (
                    <div key={comment.id} className="flex gap-3">
                      {/* User avatar - use profile avatar if available */}
                      {hasAvatar ? (
                        <img
                          src={commentUserProfile.avatar}
                          alt={commentUserProfile.username || 'User'}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 bg-background-active rounded-full flex-shrink-0 flex items-center justify-center">
                          <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-text-primary">
                            {commentUserProfile?.username || 'Anonymous'}
                          </span>
                          <span className="text-xs text-text-secondary">{(toJsDate(comment.createdAt) || toJsDate(comment.timestamp) || new Date()).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-text-secondary">{comment.content || comment.text || ''}</p>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar wrapper - Desktop only */}
          <div className="contents lg:block lg:order-2 lg:space-y-4 lg:sticky lg:top-4 lg:self-start">
            {/* Probability Card - Mobile order-2 */}
            <div className="rounded-xl bg-background-card border border-border-default overflow-hidden shadow-sm order-2 lg:order-none">
              <div className="text-center py-8">
                <div className="text-6xl font-bold text-text-primary mb-2">{Math.round(safeProbability * 100)}%</div>
                <div className="text-sm text-text-secondary">Current Probability</div>
                <div className="w-full bg-background-hover rounded-full h-1.5 mt-4 max-w-xs mx-auto">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${market.status === 'resolved_yes' ? 'bg-inverse' : market.status === 'resolved_no' ? 'bg-text-tertiary' : 'bg-inverse'}`}
                    style={{ width: `${Math.round(safeProbability * 100)}%` }}
                  />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 max-w-xs mx-auto">
                  <div className="py-3 rounded-lg font-semibold" style={{ backgroundColor: 'rgba(35, 221, 154, 0.2)', color: '#23DD9A' }}>
                    YES {Math.round(safeProbability * 100)}%
                  </div>
                  <div className="py-3 rounded-lg font-semibold" style={{ backgroundColor: 'rgba(255, 16, 16, 0.2)', color: '#FF1010' }}>
                    NO {Math.round((1 - safeProbability) * 100)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Overview - Mobile order-5 */}
            <div className="rounded-xl bg-background-card border border-border-default p-5 space-y-4 shadow-sm order-5 lg:order-none">
              <h3 className="text-lg font-semibold text-text-primary">Overview</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-background-hover border border-border-default p-3">
                  <div className="text-text-secondary text-xs">24h Volume</div>
                  <div className="text-text-primary text-lg font-semibold tabular-nums">{formatPoints(volume24h)} <span className="text-xs font-medium text-text-tertiary">pts</span></div>
                </div>
                <div className="rounded-lg bg-background-hover border border-border-default p-3">
                  <div className="text-text-secondary text-xs">Total Volume</div>
                  <div className="text-text-primary text-lg font-semibold tabular-nums">{formatPoints(totalVolume)} <span className="text-xs font-medium text-text-tertiary">pts</span></div>
                </div>
              </div>
              <div className="pt-2 border-t border-border-default space-y-2">
                <div className="flex justify-between"><span className="text-text-secondary">Creator</span><span className="text-text-primary">{creatorName}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Expires</span><span className="text-text-primary">{new Date(market.resolvesAt || '').toLocaleDateString()}</span></div>
                <div className="flex justify-between items-center"><span className="text-text-secondary">Status</span><span className={`px-2 py-1 rounded-md text-xs font-medium border ${countdown.isExpired ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>{countdown.isExpired ? 'Pending Resolution' : 'Open'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketDetail;
