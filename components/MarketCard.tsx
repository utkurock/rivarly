import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Market } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet } from '../contexts/StellarWalletContext';
import { useToast } from '../contexts/ToastContext';
import { placeBet } from '../services/betService';
import type { BetSide } from '../services/stellarTx';

// YES/NO prediction buttons: sign an on-chain bet tx, then the server verifies
// it and awards points. Lives inside a card Link, so clicks must not navigate.
const BetButtons: React.FC<{ market: Market; probability: number; disabled?: boolean }> = ({ market, probability, disabled }) => {
  const { user } = useFirebase();
  const { address } = useStellarWallet();
  const wallet = useStellarWallet();
  const { addToast } = useToast();
  const [pending, setPending] = useState<BetSide | null>(null);

  const bet = async (e: React.MouseEvent, side: BetSide) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pending) return;
    if (!user?.uid) { addToast({ type: 'info', title: 'Sign in first', message: 'Your session is still loading.' }); return; }
    if (!address) { addToast({ type: 'info', title: 'Connect your wallet', message: 'Connect a Stellar wallet to predict.' }); return; }
    setPending(side);
    try {
      const r = await placeBet(user.uid, address, market.id, side, wallet.signTransaction);
      addToast({
        type: 'success',
        title: r.isNew ? `Predicted ${side.toUpperCase()}` : `Switched to ${side.toUpperCase()}`,
        message: r.awarded ? `+${r.awarded} points` : 'Prediction updated',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Prediction failed', message: err?.message || 'Please try again.' });
    } finally {
      setPending(null);
    }
  };

  const btn = 'w-full py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2';
  return (
    <div className="space-y-2 mb-4">
      <button
        className={btn}
        style={{ backgroundColor: 'rgba(35, 221, 154, 0.2)', color: '#23DD9A' }}
        onClick={(e) => bet(e, 'yes')}
        disabled={disabled || !!pending}
      >
        {pending === 'yes' && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />}
        YES {Math.round(probability * 100)}%
      </button>
      <button
        className={btn}
        style={{ backgroundColor: 'rgba(255, 16, 16, 0.2)', color: '#FF1010' }}
        onClick={(e) => bet(e, 'no')}
        disabled={disabled || !!pending}
      >
        {pending === 'no' && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />}
        NO {Math.round((1 - probability) * 100)}%
      </button>
    </div>
  );
};

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
      className={`group block p-3 md:p-5 bg-background-card transition-all duration-200 rounded-xl h-full border border-border-default hover:border-border-strong ${
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
      <h3 className="text-base md:text-lg font-semibold text-text-primary leading-snug mb-3 md:mb-4 flex-grow line-clamp-3">
        {displayTitle}
      </h3>
      
      {/* Current Probability */}
      <div className="mb-4 relative">
        {/* Hide percentage for resolved markets */}
        {!isResolved && (
          <>
            <div className="text-4xl md:text-5xl font-bold text-text-primary mb-1">
              {Math.round(probability * 100)}%
            </div>
            <div className="text-xs md:text-sm text-text-secondary">Chance of YES</div>
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
          <div className="absolute inset-0 flex items-center justify-center bg-background-hover/90 backdrop-blur-sm rounded-lg">
            <div className="text-4xl font-black" style={{ color: '#FF1010' }}>
              NO
            </div>
          </div>
        )}
      </div>
      
      {/* Prediction Buttons */}
      <BetButtons market={market} probability={probability} disabled={status !== 'open'} />
      
      {/* Footer with Volume, Category and Timer */}
      <div className="pt-3 border-t border-border-default">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-text-secondary">${totalVolume.toFixed(0)} volume</span>
          <span className="px-2 py-0.5 bg-background-hover text-text-secondary rounded font-medium">
            {category}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-text-secondary">
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
                <div className="w-4 h-4 bg-background-active rounded-full"></div>
              );
            })()}
            <span className="text-text-secondary font-medium">
              {(market as any).creatorProfile?.username?.slice(0, 12) || 'Anonymous'}
            </span>
          </div>
          
          <div className="text-text-secondary font-medium">
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