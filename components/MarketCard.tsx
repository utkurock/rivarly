import React from 'react';
import { Link } from 'react-router-dom';
import type { Market } from '../types';
import { useCountdown } from '../hooks/useCountdown';

interface MarketCardProps {
  market: Market;
}

const MarketCard: React.FC<MarketCardProps> = ({ market }) => {
  const { 
    id, 
    status,
    resolvesAt
  } = market;
  
  // Use countdown hook
  const countdown = useCountdown(resolvesAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  
  // Determine if market is tradeable
  const isTradeable = status === 'open' && !countdown.isExpired;
  
  // Determine if market is resolved
  const isResolved = status === 'resolved_yes' || status === 'resolved_no';
  
  return (
    <div 
      className={`group block p-3 md:p-5 bg-white transition-all duration-200 rounded-xl h-full border border-gray-200 hover:border-gray-300 ${
        !isTradeable ? 'opacity-60' : ''
      } ${isResolved ? 'cursor-default' : 'hover:shadow-md'}`}
    >
      {!isResolved ? (
        <Link to={`/market/${id}`} className="block h-full">
          <MarketContent market={market} />
        </Link>
      ) : (
        <MarketContent market={market} />
      )}
    </div>
  );
};

const MarketContent: React.FC<{ market: Market }> = ({ market }) => {
  const {
    title,
    question,
    category,
    probability: rawProbability,
    resolvesAt,
    status,
    yesBets,
    noBets
  } = market;

  // Calculate total volume from market metrics
  const calculateTotalVolume = () => {
    // First, try to get from metrics (most accurate)
    if ((market as any).metrics?.totalVolumeUSD) {
      return (market as any).metrics.totalVolumeUSD;
    }
    
    // Fallback to volumeUSD field if exists
    if ((market as any).volumeUSD) {
      return (market as any).volumeUSD;
    }
    
    // Last resort: use yesBets + noBets as rough estimate for older markets
    return (yesBets || 0) + (noBets || 0);
  };
  
  const totalVolume = calculateTotalVolume();
  
  // Get current probability from market data
  const getCurrentProbability = () => {
    if (typeof rawProbability === 'number' && isFinite(rawProbability)) {
      return rawProbability;
    }
    return 0.5;
  };

  const probability = getCurrentProbability();
  const displayTitle = title || question || 'Untitled Market';

  // Use countdown hook
  const countdown = useCountdown(resolvesAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  
  // Determine if market is tradeable
  const isTradeable = status === 'open' && !countdown.isExpired;
  
  // Determine if market is resolved
  const isResolved = status === 'resolved_yes' || status === 'resolved_no';
  
  // Get status display info
  const getStatusInfo = () => {
    if (countdown.isExpired && status === 'open') {
      return { label: 'Awaiting Resolution', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' };
    }
    
    switch (status) {
      case 'resolved_yes':
        return { label: 'YES', color: 'text-blue-300', bgColor: 'bg-blue-400/30' };
      case 'resolved_no':
        return { label: 'NO', color: 'text-blue-200', bgColor: 'bg-blue-900/40' };
      case 'pending_resolution':
        return { label: 'Awaiting Resolution', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' };
      case 'expired':
        return { label: 'Expired', color: 'text-gray-400', bgColor: 'bg-gray-500/20' };
      default:
        return null;
    }
  };
  
  const statusInfo = getStatusInfo();
  
  // Format countdown display
  const formatCountdown = () => {
    if (countdown.isExpired) return '00:00:00:00';
    return `${countdown.days.toString().padStart(2, '0')}:${countdown.hours.toString().padStart(2, '0')}:${countdown.minutes.toString().padStart(2, '0')}:${countdown.seconds.toString().padStart(2, '0')}`;
  };

  // Helper function to open external URLs
  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  

  return (
    <div className="flex flex-col h-full relative">
      {/* Market Question */}
      <h3 className="text-base md:text-lg font-semibold text-gray-900 leading-snug mb-3 md:mb-4 flex-grow line-clamp-3">
        {displayTitle}
      </h3>
      
      {/* Current Probability */}
      <div className="mb-4 relative">
        {/* Hide percentage for resolved markets */}
        {!isResolved && (
          <>
            <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-1">
              {Math.round(probability * 100)}%
            </div>
            <div className="text-xs md:text-sm text-gray-500">Chance of YES</div>
          </>
        )}
        
        {/* YES/NO Overlay for Resolved Markets */}
        {status === 'resolved_yes' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm rounded-lg">
            <div className="text-4xl font-black" style={{ color: '#23DD9A' }}>
              YES
            </div>
          </div>
        )}
        {status === 'resolved_no' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90 backdrop-blur-sm rounded-lg">
            <div className="text-4xl font-black" style={{ color: '#FF1010' }}>
              NO
            </div>
          </div>
        )}
      </div>
      
      {/* Betting Buttons */}
      <div className="space-y-2 mb-4">
        <button 
          className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors"
          style={{
            backgroundColor: 'rgba(35, 221, 154, 0.2)', // #23DD9A with 20% opacity
            color: '#23DD9A'
          }}
          onClick={(e) => e.preventDefault()}
        >
          YES {Math.round(probability * 100)}%
        </button>
        <button 
          className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors"
          style={{
            backgroundColor: 'rgba(255, 16, 16, 0.2)', // #FF1010 with 20% opacity
            color: '#FF1010'
          }}
          onClick={(e) => e.preventDefault()}
        >
          NO {Math.round((1 - probability) * 100)}%
        </button>
      </div>
      
      {/* Footer with Volume, Category and Timer */}
      <div className="pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-gray-500">${totalVolume.toFixed(0)} volume</span>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
            {category}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-gray-500">
            {(() => {
              const creatorProfile = (market as any).creatorProfile;
              const hasAvatar = creatorProfile?.avatar && creatorProfile.avatar.trim() !== '';
              
              if (hasAvatar) {
                return (
                  <img
                    src={creatorProfile.avatar}
                    alt={creatorProfile.username || 'Creator'}
                    className="w-4 h-4 rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                );
              }
              
              return (
                <div className="w-4 h-4 bg-gray-200 rounded-full"></div>
              );
            })()}
            <span className="text-gray-600 font-medium">
              {(market as any).creatorProfile?.username?.slice(0, 12) || 'Anonymous'}
            </span>
          </div>
          
          <div className="text-gray-600 font-medium">
            {countdown.isExpired ? (
              <span>Ended</span>
            ) : countdown.days > 0 ? (
              <span>{countdown.days}d {countdown.hours}h</span>
            ) : countdown.hours > 0 ? (
              <span>{countdown.hours}h {countdown.minutes}m</span>
            ) : (
              <span>{countdown.minutes}m {countdown.seconds}s</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketCard;