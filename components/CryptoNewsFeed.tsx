import React, { useState, useEffect } from 'react';
import { getAllNews, getNewsByCategory } from '../services/newsService';
import { fetchPublicNews, fetchStellarNews } from '../services/publicNewsService';
import { isFirebaseConfigured } from '../firebase';
import type { NewsItem } from '../types';
import { formatTimeAgo } from '../utils/time';

// Merge admin-curated and public news, drop duplicate links, newest first.
const mergeNews = (...lists: NewsItem[][]): NewsItem[] => {
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of lists.flat()) {
    const key = item.link || item.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
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

      // Admin news from Firestore — skipped when Firebase isn't configured.
      const adminPromise: Promise<NewsItem[]> = isFirebaseConfigured
        ? (currency ? getNewsByCategory(currency) : getAllNews()).catch(() => [])
        : Promise.resolve([]);

      // Public news — general feed plus a dedicated Stellar pull so XLM always shows.
      const publicPromise: Promise<NewsItem[]> = currency
        ? fetchPublicNews(currency)
        : Promise.all([fetchPublicNews(), fetchStellarNews()]).then(([a, b]) => [...a, ...b]);

      const [adminNews, publicNews] = await Promise.all([adminPromise, publicPromise]);
      if (cancelled) return;

      const merged = mergeNews(adminNews, publicNews);
      setNews(merged);
      setLoading(false);
    };

    fetchNews();
    return () => {
      cancelled = true;
    };
  }, [selectedCurrency]);

  const currencies = [
    { code: 'XLM', name: 'Stellar', icon: '✦' },
    { code: 'BTC', name: 'Bitcoin', icon: '₿' },
    { code: 'ETH', name: 'Ethereum', icon: 'Ξ' },
    { code: 'SOL', name: 'Solana', icon: '◎' },
    { code: 'XRP', name: 'XRP', icon: 'X' },
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
    <div className="flex-1 bg-[#f8f9fa] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Crypto News</h1>
          <p className="text-gray-600 mb-6">Live headlines from public sources, plus curated picks — featuring Stellar (XLM)</p>
          
          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setSelectedCurrency(null)}
              className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                selectedCurrency === null
                  ? 'bg-black !text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm'
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
                    ? 'bg-black !text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <span className="text-base">{currency.icon}</span>
                <span>{currency.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 text-red-700 mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">Error loading news</span>
            </div>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && news.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse shadow-sm">
                <div className="h-48 bg-gray-200 rounded-lg mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {/* News Grid */}
        {!loading && news.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {news.map((newsItem) => {
              if (!newsItem || !newsItem.id || !newsItem.title) return null;
              
              return (
                <div
                  key={newsItem.id}
                  onClick={() => handleNewsClick(newsItem)}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-xl hover:border-gray-300 transition-all group/card"
                >
                  {/* Image */}
                  {newsItem.image && !imageErrors.has(newsItem.id) && (
                    <div className="relative h-48 overflow-hidden bg-gray-100">
                      <img
                        src={newsItem.image}
                        alt={newsItem.title}
                        className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                        onError={() => handleImageError(newsItem.id)}
                      />
                      {/* Category Badge */}
                      <div className="absolute top-3 right-3">
                        <div className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md bg-blue-500/90 text-white">
                          📰 {newsItem.category}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-5">
                    {/* Source & Time */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
                        {(newsItem.source || 'N').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">
                          {newsItem.source || 'Unknown Source'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatTimeAgo(new Date(newsItem.publishedAt))}
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-gray-900 mb-2 line-clamp-3 leading-snug group-hover/card:text-blue-600 transition-colors">
                      {newsItem.title}
                    </h3>

                    {/* Description */}
                    {newsItem.description && (
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3 leading-relaxed">
                        {newsItem.description}
                      </p>
                    )}

                    {/* Category Tag */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-700">
                        {newsItem.category}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && news.length === 0 && !error && (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No News Found</h3>
            <p className="text-gray-600">Check back later for new crypto updates.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CryptoNewsFeed;
