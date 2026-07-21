import { useInfiniteQuery } from '@tanstack/react-query';
import { useFirebase } from '../contexts/FirebaseContext';
import type { Market } from '../types';

interface MarketFilters {
  category?: string;
  searchTerm?: string;
  status?: string[];
}

interface MarketsPage {
  markets: Market[];
  hasMore: boolean;
  nextPage: number;
}

export function useInfiniteMarkets(filters: MarketFilters = {}) {
  const { subscribeToMarkets } = useFirebase();

  return useInfiniteQuery({
    queryKey: ['markets', filters],
    queryFn: async ({ pageParam = 1 }): Promise<MarketsPage> => {
      // For now, we'll simulate pagination with the existing Firebase data
      // In a real implementation, this would call a paginated API
      return new Promise((resolve) => {
        const unsubscribe = subscribeToMarkets((allMarkets) => {
          unsubscribe();
          
          // Apply filters
          let filteredMarkets = allMarkets;
          
          if (filters.category && filters.category !== 'All') {
            filteredMarkets = filteredMarkets.filter(market => 
              market.category === filters.category
            );
          }
          
          if (filters.searchTerm) {
            const searchLower = filters.searchTerm.toLowerCase();
            filteredMarkets = filteredMarkets.filter(market => 
              (market.title || market.question || '').toLowerCase().includes(searchLower)
            );
          }
          
          // Status filtering - default to Open if no status selected
          const statusFilters = filters.status && filters.status.length > 0 ? filters.status : ['Open'];
          
          filteredMarkets = filteredMarkets.filter(market => {
            // If both Open and Resolved are selected, show all markets
            if (statusFilters.includes('Open') && statusFilters.includes('Resolved')) {
              return true;
            }
            // If only Open is selected, show only open markets
            if (statusFilters.includes('Open') && !statusFilters.includes('Resolved')) {
              return market.status === 'open';
            }
            // If only Resolved is selected, show only resolved markets
            if (statusFilters.includes('Resolved') && !statusFilters.includes('Open')) {
              return market.status === 'resolved_yes' || market.status === 'resolved_no';
            }
            return false;
          });

          // Simulate pagination (10 items per page)
          const pageSize = 10;
          const startIndex = (pageParam - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const pageMarkets = filteredMarkets.slice(startIndex, endIndex);
          
          resolve({
            markets: pageMarkets,
            hasMore: endIndex < filteredMarkets.length,
            nextPage: pageParam + 1,
          });
        });
      });
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextPage : undefined,
    initialPageParam: 1,
    staleTime: 0, // Always fetch fresh data when filters change
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Refetch when component mounts
  });
}
