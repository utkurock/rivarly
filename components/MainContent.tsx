import React, { useState } from 'react';
import MarketCard from './MarketCard';
import InfiniteScrollSentinel from './InfiniteScrollSentinel';
import FilterTabs from './FilterTabs';
import { useInfiniteMarkets } from '../hooks/useInfiniteMarkets';

interface MainContentProps {
  activeCategory: string;
  setActiveCategory: (category: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onCreateMarket?: () => void;
}

const MainContent: React.FC<MainContentProps> = ({ activeCategory, setActiveCategory, searchTerm, setSearchTerm, onCreateMarket }) => {
  const [activeStatus, setActiveStatus] = useState<string[]>(['Open']);

  // Use infinite scroll hook
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error
  } = useInfiniteMarkets({
    category: activeCategory,
    searchTerm: searchTerm,
    status: activeStatus,
  });

  // Flatten all pages into a single array
  const allMarkets = data?.pages.flatMap(page => page.markets) || [];

  // Always use filtered data from the hook, don't fallback to unfiltered props
  const displayMarkets = allMarkets;

  return (
    <div className="flex-1 bg-background-body h-full overflow-y-auto">
      <FilterTabs 
        activeCategory={activeCategory} 
        setActiveCategory={setActiveCategory}
        activeStatus={activeStatus}
        setActiveStatus={setActiveStatus}
        onCreateMarket={onCreateMarket}
      />
      
      <div className="max-w-[1600px] mx-auto px-3 md:px-6 py-4 md:py-8 pb-24 md:pb-6 min-h-full bg-background-body">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3 md:gap-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="p-5 bg-background-card rounded-xl border border-border-default animate-pulse">
                <div className="h-4 bg-background-hover rounded mb-3"></div>
                <div className="h-4 bg-background-hover rounded mb-3 w-3/4"></div>
                <div className="h-12 bg-background-hover rounded mb-3"></div>
                <div className="flex gap-2">
                  <div className="flex-1 h-10 bg-background-hover rounded"></div>
                  <div className="flex-1 h-10 bg-background-hover rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="mx-auto w-24 h-24 bg-background-hover rounded-full flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Error loading markets</h3>
            <p className="text-text-secondary">Please try refreshing the page or check your connection.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3 md:gap-6">
              {displayMarkets.map(market => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
            
            {displayMarkets.length === 0 && (
              <div className="text-center py-20">
                <div className="mx-auto w-16 h-16 bg-background-hover rounded-2xl flex items-center justify-center mb-4 text-text-tertiary">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">No markets found</h3>
                <p className="text-sm text-text-secondary">Try adjusting your filters or search terms.</p>
              </div>
            )}
            
            {/* Infinite scroll sentinel */}
            <InfiniteScrollSentinel
              onIntersect={() => fetchNextPage()}
              isLoading={isFetchingNextPage}
              hasMore={hasNextPage}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default MainContent;
