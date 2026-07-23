import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import FeedCard from './FeedCard';
import { detectMarketLinks } from '../utils/marketLinkDetector';
import type { FeedPost } from '../services/feed';
import type { Market } from '../types';

const PostDetail: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<FeedPost | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [market, setMarket] = useState<Market | null>(null);
    const [marketLoading, setMarketLoading] = useState(false);
    
    // Search functionality
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Array<{ uid: string; username: string; avatar?: string; handle?: string }>>([]);
    
    // Trading Activity
    const [recentTrades, setRecentTrades] = useState<Array<{ id: string; marketId: string; userAddress: string; side: 'YES'|'NO'; amount: number; createdAt?: any }>>([]);
    const [marketCache, setMarketCache] = useState<Record<string, Market>>({});
    
    const formatTimeAgo = (date: Date): string => {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        return `${days}d`;
    };

    useEffect(() => {
        // Scroll to top when component mounts
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        const fetchPost = async () => {
            if (!postId) {
                setError('Post ID not found');
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                const postDoc = await getDoc(doc(db, 'feed', postId));
                
                if (postDoc.exists()) {
                    const postData = {
                        id: postDoc.id,
                        ...postDoc.data()
                    } as FeedPost;
                    
                    setPost(postData);
                    
                    // Fetch market if post has market link
                    const links = detectMarketLinks(postData.text || '');
                    if (links.length > 0) {
                        const lastLink = links[links.length - 1];
                        setMarketLoading(true);
                        try {
                            const marketDoc = await getDoc(doc(db, 'markets', lastLink.marketId));
                            if (marketDoc.exists()) {
                                setMarket({
                                    id: marketDoc.id,
                                    ...marketDoc.data(),
                                } as Market);
                            }
                        } catch (marketErr) {
                            console.error('Error fetching market:', marketErr);
                        } finally {
                            setMarketLoading(false);
                        }
                    }
                } else {
                    setError('Post not found');
                }
            } catch (err) {
                console.error('Error fetching post:', err);
                setError('Failed to load post');
            } finally {
                setIsLoading(false);
            }
        };

        fetchPost();
    }, [postId]);

    // Search users by username
    useEffect(() => {
        const doSearch = async () => {
            const q = searchQuery.trim().toLowerCase();
            if (q.length < 2) {
                setSearchResults([]);
                return;
            }

            try {
                const usersRef = collection(db, 'users');
                const snap = await getDocs(query(usersRef, orderBy('username'), limit(20)));
                const results: Array<{ uid: string; username: string; avatar?: string; handle?: string }> = [];
                snap.forEach(d => {
                    const data = d.data() as any;
                    const uname = (data.username || data.displayName || '').toLowerCase();
                    const handleStr = (data.handle || '').toLowerCase();
                    if (uname.includes(q) || handleStr.includes(q)) {
                        results.push({ uid: d.id, username: data.username || data.displayName || 'Anonymous', avatar: data.avatar || data.avatarUrl, handle: data.handle });
                    }
                });
                setSearchResults(results.slice(0, 8));
            } catch (e) {
                setSearchResults([]);
            }
        };

        const t = setTimeout(doSearch, 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Load recent trading activity
    useEffect(() => {
        const loadTrades = async () => {
            try {
                const betsRef = collection(db, 'bets');
                const snap = await getDocs(query(betsRef, orderBy('createdAt', 'desc'), limit(20)));
                const trades: Array<{ id: string; marketId: string; userAddress: string; side: 'YES'|'NO'; amount: number; createdAt?: any }> = [];
                snap.forEach(d => {
                    const data = d.data();
                    trades.push({ 
                        id: d.id, 
                        marketId: data.marketId,
                        userAddress: data.userAddress || '',
                        side: data.side,
                        amount: data.amount,
                        createdAt: data.createdAt
                    });
                });
                setRecentTrades(trades);
                
                // Preload market titles for all trades
                const marketIds = new Set(trades.map(t => t.marketId));
                for (const mid of Array.from(marketIds)) {
                    if (!marketCache[mid]) {
                        try {
                            const mdoc = await getDoc(doc(db, 'markets', mid));
                            if (mdoc.exists()) {
                                setMarketCache(prev => ({ ...prev, [mid]: { id: mdoc.id, ...(mdoc.data() as any) } as Market }));
                            }
                        } catch (err) {
                            console.error('Error loading market:', err);
                        }
                    }
                }
            } catch (e) {
                console.error('Error loading trades:', e);
                setRecentTrades([]);
            }
        };
        
        loadTrades();
        const interval = setInterval(loadTrades, 10000);
        return () => clearInterval(interval);
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background-body flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
        );
    }

    if (error || !post) {
        return (
            <div className="min-h-screen bg-background-body flex flex-col items-center justify-center px-4">
                <div className="max-w-md w-full text-center">
                    <div className="w-20 h-20 mx-auto mb-6 bg-background-hover rounded-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-text-primary mb-3">Post Not Found</h2>
                    <p className="text-text-secondary mb-6">{error || 'This post might have been deleted or the link is incorrect.'}</p>
                    <button
                        onClick={() => navigate('/social')}
                        className="px-6 py-3 bg-inverse hover:bg-inverse-hover !text-inverse-ink font-semibold rounded-lg transition-colors shadow-sm"
                    >
                        Back to Feed
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-body flex">
            {/* Main Content - No vertical borders */}
            <div className="flex-1 bg-background-card border-r border-border-default">
                {/* Header with back button */}
                <div className="sticky top-0 z-10 bg-background-body/80 backdrop-blur-md border-b border-border-default">
                    <div className="px-6 py-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-2 text-text-secondary hover:text-white transition-colors group p-2 -ml-2"
                        >
                            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Post Content */}
                <div className="px-6 py-4">
                    <div className="max-w-2xl mx-auto">
                        <FeedCard post={post} autoExpandReplies={true} disableNavigation={true} />
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Same as Social Feed */}
            <div className="hidden lg:block w-[350px] bg-background-card border-l border-border-default">
                <div className="sticky top-0 max-h-screen overflow-y-auto overscroll-contain">
                    {/* Search Bar */}
                    <div className="p-4 border-b border-transparent">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search"
                                className="w-full pl-10 pr-4 py-2.5 bg-background-hover border-0 rounded-full text-text-primary placeholder-gray-500 text-sm focus:outline-none focus:bg-background-card focus:ring-2 focus:ring-[#23DD9A] focus:ring-opacity-20 transition-all"
                            />
                        </div>
                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="mt-3 bg-background-card border border-border-default rounded-xl overflow-hidden shadow-sm">
                                {searchResults.map(u => (
                                    <button
                                        key={u.uid}
                                        onClick={() => navigate(`/profile/${u.uid}`)}
                                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-background-hover text-left"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-background-active overflow-hidden flex items-center justify-center">
                                            {u.avatar ? (
                                                <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-xs font-bold text-text-secondary">{u.username?.[0]?.toUpperCase() || 'U'}</span>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-text-primary truncate">{u.username}</div>
                                            <div className="text-xs text-text-secondary truncate">
                                                {u.handle && u.handle.trim() ? `@${u.handle}` : `@${u.uid.slice(0,6)}...${u.uid.slice(-4)}`}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Trading Activity */}
                    <div className="p-4 pb-6 border-b border-border-default">
                        <h3 className="font-bold text-text-primary mb-4">Trading Activity</h3>
                        <div className="space-y-3 max-h-[640px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                            {recentTrades.length === 0 ? (
                                <div className="text-sm text-text-secondary py-4 text-center">No recent trades</div>
                            ) : (
                                recentTrades.map(trade => {
                                    const m = marketCache[trade.marketId];
                                    const marketTitle = m?.title || m?.question || ('Market #' + trade.marketId.slice(0, 8));
                                    const userAddressShort = trade.userAddress 
                                        ? `${trade.userAddress.slice(0, 4)}...${trade.userAddress.slice(-4)}`
                                        : 'Unknown';
                                    
                                    // Convert createdAt to Date if it's a Firestore Timestamp
                                    let tradeDate: Date;
                                    if (trade.createdAt) {
                                        if (trade.createdAt.toDate) {
                                            tradeDate = trade.createdAt.toDate();
                                        } else if (trade.createdAt instanceof Date) {
                                            tradeDate = trade.createdAt;
                                        } else if (typeof trade.createdAt === 'number') {
                                            tradeDate = new Date(trade.createdAt);
                                        } else {
                                            tradeDate = new Date();
                                        }
                                    } else {
                                        tradeDate = new Date();
                                    }
                                    
                                    return (
                                        <div 
                                            key={trade.id} 
                                            className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-background-hover cursor-pointer transition-colors" 
                                            onClick={() => navigate(`/market/${trade.marketId}`)}
                                        >
                                            <div className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${trade.side === 'YES' ? 'bg-[#23DD9A]' : 'bg-[#FF1010]'}`}></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-text-primary leading-snug">
                                                    <span className={trade.side === 'YES' ? 'text-[#23DD9A]' : 'text-[#FF1010]'}>
                                                        {trade.side}
                                                    </span>
                                                    {' '}${trade.amount.toFixed(2)}
                                                </div>
                                                <div className="text-xs text-text-secondary mt-0.5 truncate">
                                                    {marketTitle}
                                                </div>
                                                <div className="text-xs text-text-secondary mt-1">
                                                    @{userAddressShort} • {(m as any)?.category || 'Market'} • {formatTimeAgo(tradeDate)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                    
                    {/* Bottom spacer */}
                    <div className="h-4"></div>
                </div>
            </div>
        </div>
    );
};

export default PostDetail;

