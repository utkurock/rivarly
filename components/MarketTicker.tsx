import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { marketPath } from '../utils/slug';

interface MarketTickerData {
  id: string;
  title: string;
  question: string;
  category: string;
  probability: number;
  volumeUSD: number;
}

const MarketTicker: React.FC = () => {
  const [markets, setMarkets] = useState<MarketTickerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTopMarkets = async () => {
      try {
        // Fetch only OPEN markets ordered by volumeUSD (highest first)
        const marketsQuery = query(
          collection(db, 'markets'),
          orderBy('volumeUSD', 'desc'),
          limit(20) // Fetch more to filter, then take top 10
        );
        
        const snapshot = await getDocs(marketsQuery);
        const marketsData = snapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title || data.question || 'Untitled Market',
              question: data.question || '',
              category: data.category || 'Other',
              probability: data.probability || 0.5,
              volumeUSD: data.volumeUSD || (data.metrics?.totalVolumeUSD) || 0,
              status: data.status || 'open',
            };
          })
          .filter(market => market.status === 'open') // Only show open markets
          .slice(0, 10); // Take top 10

        setMarkets(marketsData);
        setIsLoading(false);
      } catch (error: any) {
        // Handle permission errors gracefully
        if (error?.code === 'permission-denied') {
          console.warn('Firestore permission denied - using mock data');
          // Use mock data when permission denied
          setMarkets([
            { id: '1', title: 'Bitcoin Price', question: 'Will Bitcoin reach $100k?', category: 'Crypto', probability: 0.65, volumeUSD: 50000 },
            { id: '2', title: 'Stellar TVL', question: 'Will Stellar DeFi TVL top $500M this year?', category: 'Ecosystem', probability: 0.52, volumeUSD: 45000 },
            { id: '3', title: 'XLM Rally', question: 'Will XLM close above $0.50 this quarter?', category: 'Crypto', probability: 0.75, volumeUSD: 30000 },
          ]);
        } else {
          console.error('Error fetching top markets:', error);
        }
        setIsLoading(false);
      }
    };

    fetchTopMarkets();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTopMarkets, 30000);

    // Safety net: if the first Firestore read is slow to connect, stop showing
    // the "Loading..." strip after a few seconds so the ticker collapses cleanly.
    const loadingTimeout = setTimeout(() => setIsLoading(false), 6000);

    return () => {
      clearInterval(interval);
      clearTimeout(loadingTimeout);
    };
  }, []);

  // While the first fetch is in flight, show a slim loading strip.
  if (isLoading) {
    return (
      <div className="bg-background-card border-b border-border-default overflow-hidden h-10 md:h-12 z-10">
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-text-secondary text-xs md:text-sm">Loading top markets...</div>
        </div>
      </div>
    );
  }

  // No open markets to show — collapse the ticker entirely instead of leaving a
  // permanent "loading" strip stuck at the top of every page.
  if (markets.length === 0) return null;

  // Create enough duplicates for seamless infinite scroll
  const duplicateCount = markets.length < 5 ? 6 : 3; // More duplicates for fewer items
  const displayMarkets = Array(duplicateCount).fill(markets).flat();

  return (
    <div className="bg-background-card border-b border-border-default overflow-hidden h-10 md:h-12 relative z-10">
      <div className="flex items-center gap-4 md:gap-8 animate-infinite-scroll h-full">
        {displayMarkets.map((market, index) => (
          <Link
            key={`${market.id}-${index}`}
            to={marketPath(market)}
            className="flex items-center gap-2 md:gap-3 whitespace-nowrap flex-shrink-0 hover:opacity-70 transition-opacity px-2 md:px-4"
          >
            {/* Category Badge */}
            <span className="px-1.5 md:px-2 py-0.5 bg-background-hover text-text-secondary text-[10px] md:text-xs font-medium rounded">
              {market.category}
            </span>
            
            {/* Market Title (truncated) */}
            <span className="text-text-primary text-xs md:text-sm font-medium max-w-[150px] md:max-w-[300px] truncate">
              {market.title.length > 50 ? `${market.title.slice(0, 50)}...` : market.title}
            </span>
            
            {/* Probability */}
            <span className="text-text-secondary text-xs md:text-sm font-semibold">
              {Math.round(market.probability * 100)}%
            </span>
            
            {/* Volume - hide on very small screens */}
            <span className="hidden sm:inline text-text-secondary text-[10px] md:text-xs">
              ${market.volumeUSD.toFixed(0)} vol
            </span>

            {/* Separator */}
            <span className="text-text-tertiary hidden sm:inline">•</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default MarketTicker;

