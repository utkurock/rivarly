import React, { useEffect, useRef } from 'react';

interface InfiniteScrollSentinelProps {
  onIntersect: () => void;
  isLoading?: boolean;
  hasMore?: boolean;
}

const InfiniteScrollSentinel: React.FC<InfiniteScrollSentinelProps> = ({
  onIntersect,
  isLoading = false,
  hasMore = true,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoading) {
          onIntersect();
        }
      },
      {
        rootMargin: '100px', // Trigger 100px before the element comes into view
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [onIntersect, isLoading, hasMore]);

  if (!hasMore) {
    return null;
  }

  return (
    <div ref={sentinelRef} className="py-6 text-center">
      {isLoading && (
        <div className="flex justify-center items-center space-x-2 text-gray-400">
          <svg className="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm">Loading more...</span>
        </div>
      )}
    </div>
  );
};

export default InfiniteScrollSentinel;
