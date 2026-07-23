import React, { useState, useEffect } from 'react';
import { getAllNews, getNewsByCategory } from '../services/newsService';
import { fetchPublicNews, readNewsCache, writeNewsCache } from '../services/publicNewsService';
import { isFirebaseConfigured } from '../firebase';
import type { NewsItem } from '../types';
import { formatTimeAgo } from '../utils/time';
import CoinIcon from './CoinIcon';

// Keep only the newest 20 items shown at once.
const MAX_NEWS = 20;

// Merge admin-curated and public news: images only, drop duplicate links,
// newest first, capped at MAX_NEWS (older items fall off the bottom).
const mergeNews = (...lists: NewsItem[][]): NewsItem[] => {
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of lists.flat()) {
    if (!item.image) continue; // no image, no card
    const key = item.link || item.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_NEWS);
};

const CryptoNewsFeed: React.FC = () => {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch admin-curated (Firestore) news and public (CryptoPanic) news, then merge.
  useEffect(() => {
    let cancelled = false;

    const fetchNews = async () => {
      setLoading(true);
      setError(null);

      const currency = selectedCurrency && selectedCurrency !== 'ALL' ? selectedCurrency : undefined;

      // 1) Instant paint from the Firestore cache (a single ~10 KB doc), so
      //    returning visitors don't wait on the slow RSS aggregation.
      const cached = await readNewsCache(currency);
      if (cancelled) return;
      if (cached.length) {
        setNews(mergeNews(cached));
        setLoading(false);
      }

      // Admin news from Firestore, skipped when Firebase isn't configured.
      const adminPromise: Promise<NewsItem[]> = isFirebaseConfigured
        ? (currency ? getNewsByCategory(currency) : getAllNews()).catch(() => [])
        : Promise.resolve([]);

      // 2) Refresh from the edge aggregator (curated Stellar-forward mix / coin
      //    filter). This is the slow path; only it blocks when there is no cache.
      const publicNews = await fetchPublicNews(currency);
      if (cancelled) return;
      if (publicNews.length) {
        setNews(mergeNews(publicNews));
        // Write-through so the next visitor gets it instantly.
        writeNewsCache(currency);
      }
      setLoading(false);

      // 3) Merge admin-curated news in the background once (and if) it resolves.
      const adminNews = await adminPromise;
      if (cancelled || adminNews.length === 0) return;
      setNews(mergeNews(adminNews, publicNews));
    };

    fetchNews();
    return () => {
      cancelled = true;
    };
  }, [selectedCurrency]);

  const currencies = [
    { code: 'XLM', name: 'Stellar' },
    { code: 'BTC', name: 'Bitcoin' },
    { code: 'ETH', name: 'Ethereum' },
    { code: 'SOL', name: 'Solana' },
  ];

  const handleImageError = (id: string) => {
    setImageErrors(prev => new Set(prev).add(id));
  };

  const handleNewsClick = (newsItem: NewsItem) => {
    window.open(newsItem.link, '_blank', 'noopener,noreferrer');
  };

  const handleCurrencyFilter = (currency: string) => {
    setSelectedCurrency(prev => prev === currency ? null : currency);
  };

  return (
    <div className="flex-1 bg-background-body min-h-screen">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-4">Crypto News</h1>
          <p className="text-text-secondary mb-6">Live crypto headlines from public sources. Click a project to see its own news.</p>
          
          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setSelectedCurrency(null)}
              className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                selectedCurrency === null
                  ? 'bg-inverse !text-inverse-ink shadow-md'
                  : 'bg-background-card text-text-secondary border border-border-default hover:border-border-strong hover:shadow-sm'
              }`}
            >
              All News
            </button>
            {currencies.map((currency) => (
              <button
                key={currency.code}
                onClick={() => handleCurrencyFilter(currency.code)}
                className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                  selectedCurrency === currency.code
                    ? 'bg-inverse !text-inverse-ink shadow-md'
                    : 'bg-background-card text-text-secondary border border-border-default hover:border-border-strong hover:shadow-sm'
                }`}
              >
                <CoinIcon code={currency.code} className="w-4 h-4" mono={selectedCurrency === currency.code} />
                <span>{currency.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 text-red-400 mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">Error loading news</span>
            </div>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && news.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="bg-background-card rounded-xl border border-border-default p-4 animate-pulse shadow-sm">
                <div className="h-48 bg-background-hover rounded-lg mb-4"></div>
                <div className="h-4 bg-background-hover rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-background-hover rounded w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {/* News Grid */}
        {!loading && news.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {news.map((newsItem) => {
              if (!newsItem || !newsItem.id || !newsItem.title) return null;
              // Image-only: skip items with no image or whose image failed to load.
              if (!newsItem.image || imageErrors.has(newsItem.id)) return null;

              return (
                <div
                  key={newsItem.id}
                  onClick={() => handleNewsClick(newsItem)}
                  className="bg-background-card rounded-xl border border-border-default overflow-hidden cursor-pointer hover:shadow-xl hover:border-border-strong transition-all group/card"
                >
                  {/* Image */}
                  <div className="relative h-48 overflow-hidden bg-background-hover">
                    <img
                      src={newsItem.image}
                      alt={newsItem.title}
                      className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                      onError={() => handleImageError(newsItem.id)}
                    />
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    {/* Source & Time */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
                        {(newsItem.source || 'N').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-text-primary truncate">
                          {newsItem.source || 'Unknown Source'}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {formatTimeAgo(new Date(newsItem.publishedAt))}
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-text-primary mb-2 line-clamp-3 leading-snug group-hover/card:text-blue-400 transition-colors">
                      {newsItem.title}
                    </h3>

                    {/* Description */}
                    {newsItem.description && (
                      <p className="text-sm text-text-secondary line-clamp-2 mb-3 leading-relaxed">
                        {newsItem.description}
                      </p>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {(newsItem.tags && newsItem.tags.length ? newsItem.tags : [newsItem.category]).map((t) => {
                        const isCoin = t !== 'Crypto';
                        return (
                          <span
                            key={t}
                            className={`px-2 py-1 rounded-md text-xs font-semibold ${
                              isCoin ? 'bg-blue-500/10 text-blue-400' : 'bg-background-hover text-text-secondary'
                            }`}
                          >
                            {t}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && news.length === 0 && !error && (
          <div className="text-center py-20 bg-background-card rounded-xl border border-border-default shadow-sm">
            <div className="w-20 h-20 mx-auto mb-6 bg-background-hover rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">No News Found</h3>
            <p className="text-text-secondary">Check back later for new crypto updates.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CryptoNewsFeed;
