import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, increment, arrayUnion, arrayRemove, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import FeedComposer from './FeedComposer';
import { detectMarketLinks, parseTextWithMarketLinks } from '../utils/marketLinkDetector';
import { subscribeToFollowingList } from '../services/followService';
import { subscribeToReplies } from '../services/feed';
import type { Market } from '../types';
import type { FeedReply } from '../services/feed';
import { searchUsers } from '../services/feed';

interface SocialFeedProps {
  posts?: any[];
  onAddPost?: (content: string, user: any) => void;
  onLikePost?: (postId: string) => void;
  onCommentPost?: (postId: string, content: string) => void;
}

const SocialFeed: React.FC<SocialFeedProps> = ({ 
  posts, 
  onAddPost, 
  onLikePost, 
  onCommentPost 
}) => {
  const { user, userProfile } = useFirebase();
  const navigate = useNavigate();
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'foryou' | 'following'>('foryou');
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [repostedPosts, setRepostedPosts] = useState<Set<string>>(new Set());
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [marketCache, setMarketCache] = useState<Record<string, Market>>({});
  const [replies, setReplies] = useState<Record<string, FeedReply[]>>({});
  const [showReplies, setShowReplies] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ uid: string; username: string; avatar?: string; handle?: string }>>([]);
  const [recentTrades, setRecentTrades] = useState<Array<{ id: string; marketId: string; userAddress: string; side: 'YES'|'NO'; amount: number; createdAt?: any }>>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Navigate to a user's profile by uid
  const openProfile = useCallback((uid?: string) => {
    if (uid) {
      navigate(`/profile/${uid}`);
    }
  }, [navigate]);

  // Fetch all social posts and initialize liked/reposted state
  useEffect(() => {
    const postsQuery = query(
      collection(db, 'feed'),  // Changed from 'posts' to 'feed'
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const postsArray: any[] = [];
      const newLikedPosts = new Set<string>();
      const newRepostedPosts = new Set<string>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const post: any = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        };

        // Check if current user has liked/reposted this post (use Firebase uid)
        if (user?.uid && data.likedBy && Array.isArray(data.likedBy) && data.likedBy.includes(user.uid)) {
          newLikedPosts.add(doc.id);
        }
        if (user?.uid && data.repostedBy && Array.isArray(data.repostedBy) && data.repostedBy.includes(user.uid)) {
          newRepostedPosts.add(doc.id);
        }

        postsArray.push(post);
      });

      setSocialPosts(postsArray);
      setLikedPosts(newLikedPosts);
      setRepostedPosts(newRepostedPosts);
    });

    return () => unsubscribe();
  }, [user?.uid]);

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

  // Fetch markets for posts with market links
  useEffect(() => {
    const fetchMarkets = async () => {
      const marketIds = new Set<string>();
      
      socialPosts.forEach(post => {
        const links = detectMarketLinks(post.text || '');
        links.forEach(link => marketIds.add(link.marketId));
      });

      for (const marketId of Array.from(marketIds)) {
        if (!marketCache[marketId]) {
          try {
            const marketDoc = await getDoc(doc(db, 'markets', marketId));
            if (marketDoc.exists()) {
              const marketData = {
                id: marketDoc.id,
                ...marketDoc.data(),
              } as Market;
              setMarketCache(prev => ({ ...prev, [marketId]: marketData }));
            }
          } catch (error) {
            console.error('Error fetching market:', error);
          }
        }
      }
    };

    if (socialPosts.length > 0) {
      fetchMarkets();
    }
  }, [socialPosts, marketCache]);

  // Search users by username
  useEffect(() => {
    const doSearch = async () => {
      const q = searchQuery.trim();
      if (q.length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await searchUsers(q);
        setSearchResults(results.slice(0, 8));
      } catch {
        setSearchResults([]);
      }
    };

    const t = setTimeout(doSearch, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Subscribe to following list
  useEffect(() => {
    if (!user?.uid) {
      setFollowingIds(new Set());
      return;
    }

    const unsubscribe = subscribeToFollowingList(user.uid, (ids) => {
      setFollowingIds(new Set(ids));
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Subscribe to replies for posts that have showReplies enabled
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    
    Object.keys(showReplies).forEach(postId => {
      if (showReplies[postId]) {
        // Always subscribe when showReplies is true (real-time updates)
        const unsubscribe = subscribeToReplies(postId, (loadedReplies) => {
          setReplies(prev => ({ ...prev, [postId]: loadedReplies }));
        });
        unsubscribes.push(unsubscribe);
      }
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [showReplies]);

  // Load recent trading activity for all users
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
    // Refresh every 10 seconds
    const interval = setInterval(loadTrades, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLike = async (postId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!user?.uid) return;

    const postRef = doc(db, 'feed', postId);
    const isLiked = likedPosts.has(postId);
    
    // Prevent double liking
    if (!isLiked) {
      try {
        await updateDoc(postRef, {
          likeCount: increment(1),
          likedBy: arrayUnion(user.uid)
        });
        
        setLikedPosts(prev => new Set(prev).add(postId));
      } catch (error) {
        console.error('Error updating like:', error);
      }
    } else {
      // Unlike
      try {
        await updateDoc(postRef, {
          likeCount: increment(-1),
          likedBy: arrayRemove(user.uid)
        });
        
        setLikedPosts(prev => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
      } catch (error) {
        console.error('Error updating unlike:', error);
      }
    }
  };

  const handleRepost = async (postId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!user?.uid) return;

    const postRef = doc(db, 'feed', postId);
    const isReposted = repostedPosts.has(postId);
    
    // Prevent double reposting
    if (!isReposted) {
      try {
        await updateDoc(postRef, {
          repostCount: increment(1),
          repostedBy: arrayUnion(user.uid)
        });
        
        setRepostedPosts(prev => new Set(prev).add(postId));
      } catch (error) {
        console.error('Error updating repost:', error);
      }
    } else {
      // Unrepost
      try {
        await updateDoc(postRef, {
          repostCount: increment(-1),
          repostedBy: arrayRemove(user.uid)
        });
        
        setRepostedPosts(prev => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
      } catch (error) {
        console.error('Error updating unrepost:', error);
      }
    }
  };

  const handleComment = (postId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Toggle replies visibility
    const isRepliesVisible = showReplies[postId] || false;
    
    if (isRepliesVisible) {
      // If replies are visible, close them
      setShowReplies(prev => ({ ...prev, [postId]: false }));
      setOpenReplyId(null); // Also close reply box if open
    } else {
      // If replies are hidden, show them and open reply box
      setShowReplies(prev => ({ ...prev, [postId]: true }));
      setOpenReplyId(postId);
    }
  };

  const handleReplySubmit = async (postId: string) => {
    const replyText = replyTexts[postId]?.trim();
    if (!replyText || !user) return;

    try {
      const { replyToPost } = await import('../services/feed');
      // Use userProfile if available, otherwise fallback to user data
      const displayName = userProfile?.username || userProfile?.displayName || user.displayName || 'Anonymous';
      const handle = (userProfile?.handle && userProfile.handle.trim())
        ? userProfile.handle
        : user.uid.slice(0, 6);
      const avatarUrl = userProfile?.avatar || userProfile?.avatarUrl || user.photoURL || '';
      
      await replyToPost({
        postId,
        uid: user.uid,
        text: replyText,
        displayName,
        handle,
        avatarUrl,
      });
      
      setReplyTexts(prev => ({ ...prev, [postId]: '' }));
      // Keep reply box open and show replies
      setShowReplies(prev => ({ ...prev, [postId]: true }));
      
      // Replies will be loaded automatically by the useEffect that watches showReplies
    } catch (error) {
      console.error('Error submitting reply:', error);
      alert('Failed to post reply');
    }
  };

  const handlePostClick = (postId: string) => {
    // Navigate to post detail page
    navigate(`/post/${postId}`);
  };

  const handleDeletePost = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
      const { deleteFeedPost } = await import('../services/feed');
      await deleteFeedPost(postId);
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Main Content - White Theme - Wider - No left spacer */}
      <div className="flex-1 bg-white border-r border-gray-200">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 z-40">
          <div className="px-6 py-3">
            {/* Tabs */}
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('foryou')}
                className={`flex-1 py-3 px-4 text-center font-semibold text-sm transition-all ${
                  activeTab === 'foryou'
                    ? 'bg-[#23DD9A1A] text-[#23DD9A]'
                    : 'text-gray-500 hover:text-[#23DD9A] hover:bg-[#23DD9A1A]'
                } rounded-lg`}
              >
                For you
              </button>
              <button
                onClick={() => setActiveTab('following')}
                className={`flex-1 py-3 px-4 text-center font-semibold text-sm transition-all ${
                  activeTab === 'following'
                    ? 'bg-[#23DD9A1A] text-[#23DD9A]'
                    : 'text-gray-500 hover:text-[#23DD9A] hover:bg-[#23DD9A1A]'
                } rounded-lg`}
              >
                Following
              </button>
            </div>
          </div>
        </div>

        {/* Post Composer - Twitter style */}
        {user && (
          <div className="border-b border-gray-200 px-6 py-3">
            <FeedComposer onPostCreated={() => {}} />
          </div>
        )}

        {/* Posts Feed */}
        <div className="pb-24">
          {(() => {
            // Filter posts based on active tab
            let filteredPosts = socialPosts;
            if (activeTab === 'following') {
              if (followingIds.size === 0) {
                return (
                  <div className="px-6 py-12 text-center">
                    <p className="text-gray-500 text-sm">You're not following anyone yet. Follow users to see their posts here.</p>
                  </div>
                );
              }
              filteredPosts = socialPosts.filter(post => 
                post.uid && followingIds.has(post.uid)
              );
              if (filteredPosts.length === 0) {
                return (
                  <div className="px-6 py-12 text-center">
                    <p className="text-gray-500 text-sm">No posts from people you follow yet.</p>
                  </div>
                );
              }
            }
            return filteredPosts.map((post) => (
            <div
              key={post.id}
              className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => handlePostClick(post.id)}
            >
              <div className="px-6 py-6">
                {/* Post Content */}
                <div className="flex items-start gap-3">
                  {/* Avatar - Clickable */}
                  <Link to={`/profile/${post.uid || post.userId || post.id}`} className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity">
                    {post.avatarUrl ? (
                      <img src={post.avatarUrl} alt={post.displayName || 'User'} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-gray-600">
                        {(post.displayName || post.authorName)?.[0]?.toUpperCase() || 'U'}
                      </span>
                    )}
                  </Link>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    {/* User Info */}
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to="#"
                        className="hover:underline flex items-center gap-1"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openProfile(post.uid || post.userId || post.id);
                        }}
                      >
                        <span className="font-semibold text-gray-900">{post.displayName || post.authorName || 'Anonymous'}</span>
                      </Link>
                      <span className="text-gray-500 text-sm">
                        {(post.handle && post.handle.trim())
                          ? `@${post.handle}`
                          : `@${post.uid?.slice(0, 6) || 'user'}`}
                      </span>
                      <span className="text-gray-500 text-sm">·</span>
                      <span className="text-gray-500 text-sm">{formatTimeAgo(post.createdAt)}</span>
                      
                      {/* Delete button - only if user is owner */}
                      {user?.uid === post.uid && (
                        <button
                          onClick={(e) => handleDeletePost(post.id, e)}
                          className="ml-auto text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Delete post"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Post Text with Market Widgets */}
                    {post.text && (() => {
                      const links = detectMarketLinks(post.text);
                      
                      if (links.length === 0) {
                        return <p className="text-gray-900 text-sm mb-3 leading-relaxed">{post.text}</p>;
                      }

                      const parts = parseTextWithMarketLinks(post.text);
                      const firstMarketPart = parts.find(p => p.type === 'market-link' && p.marketId);
                      const market = firstMarketPart?.marketId ? marketCache[firstMarketPart.marketId] : null;
                      
                      const textWithoutLinks = parts
                        .filter(part => part.type !== 'market-link')
                        .map(part => part.content)
                        .join('');

                      return (
                        <>
                          {textWithoutLinks.trim() && (
                            <p className="text-gray-900 text-sm mb-3 leading-relaxed">{textWithoutLinks}</p>
                          )}

                          {market && (
                            <div
                              className="mb-3 border border-gray-200 rounded-xl bg-white p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/market/${market.id}`);
                              }}
                            >
                              <p className="text-sm font-semibold text-gray-900 leading-snug">
                                {market.title || market.question || 'Market'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">{market.category || 'Market'}</p>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Post Image - Twitter Style */}
                    {(post.media && post.media.length > 0) && (
                      <div className="rounded-xl overflow-hidden mb-3 border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity">
                        <img
                          src={post.media[0].url}
                          alt="Post"
                          className="w-full max-h-[500px] object-contain bg-gray-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Open in modal or full screen
                            window.open(post.media[0].url, '_blank');
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Engagement Icons */}
                <div className="flex items-center gap-6 mt-2 ml-[52px]">
                  <button 
                    onClick={(e) => handleComment(post.id, e)}
                    className="flex items-center gap-1 text-gray-500 hover:text-blue-500 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-xs">{post.replyCount || post.comments || 0}</span>
                  </button>
                  <button 
                    onClick={(e) => {
                      handleRepost(post.id, e);
                    }}
                    className={`flex items-center gap-1 transition-colors ${repostedPosts.has(post.id) ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span className="text-xs">{post.repostCount || post.shares || 0}</span>
                  </button>
                  <button 
                    onClick={(e) => {
                      handleLike(post.id, e);
                    }}
                    className={`flex items-center gap-1 transition-colors ${likedPosts.has(post.id) ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs">{post.likeCount || post.likes || 0}</span>
                  </button>
                </div>

                {/* Replies List - Show if enabled and there are replies */}
                {showReplies[post.id] && (
                  <div className="mt-4 ml-[52px] pt-4 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                    {replies[post.id] && replies[post.id].length > 0 ? (
                      <div className="space-y-4">
                        {replies[post.id].map((reply) => (
                        <div key={reply.id} className="flex gap-3">
                          {/* Reply Avatar */}
                          {reply.avatarUrl ? (
                            <img 
                              src={reply.avatarUrl} 
                              alt={reply.displayName} 
                              className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-gray-500">
                                {reply.displayName?.[0]?.toUpperCase() || 'U'}
                              </span>
                            </div>
                          )}
                          
                          {/* Reply Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Link 
                                to={`/profile/${reply.uid}`} 
                                className="font-semibold text-sm text-gray-900 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {reply.displayName || 'Anonymous'}
                              </Link>
                              <span className="text-xs text-gray-500">
                                {reply.handle && reply.handle.trim() ? `@${reply.handle}` : `@${reply.uid?.slice(0, 6) || 'user'}`}
                              </span>
                              {reply.createdAt && (
                                <>
                                  <span className="text-xs text-gray-500">·</span>
                                  <span className="text-xs text-gray-500">
                                    {formatTimeAgo(reply.createdAt.toDate ? reply.createdAt.toDate() : new Date(reply.createdAt))}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{reply.text}</p>
                          </div>
                        </div>
                      ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 py-2">No comments yet</div>
                    )}
                  </div>
                )}

                {/* Inline Reply Box */}
                {openReplyId === post.id && (
                  <div className="mt-4 ml-[52px] pt-4 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-3">
                      {/* Avatar */}
                      {userProfile?.avatar ? (
                        <img 
                          src={userProfile.avatar} 
                          alt="Your avatar" 
                          className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : user?.photoURL ? (
                        <img 
                          src={user.photoURL} 
                          alt="Your avatar" 
                          className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                      
                      {/* Reply Input */}
                      <div className="flex-1">
                        <textarea
                          value={replyTexts[post.id] || ''}
                          onChange={(e) => setReplyTexts(prev => ({ ...prev, [post.id]: e.target.value }))}
                          placeholder="Write your reply..."
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm resize-none focus:outline-none focus:border-gray-300 focus:bg-white"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-3 mt-3">
                          <button
                            onClick={() => {
                              setOpenReplyId(null);
                              setReplyTexts(prev => ({ ...prev, [post.id]: '' }));
                            }}
                            className="px-4 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleReplySubmit(post.id)}
                            disabled={!replyTexts[post.id]?.trim()}
                            className="px-4 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            ));
          })()}

          {socialPosts.length === 0 && activeTab === 'foryou' && (
            <div className="px-6 py-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500 text-lg font-medium">No posts yet</p>
              <p className="text-gray-400 text-sm mt-2">Be the first to share something!</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Clean */}
      <div className="hidden lg:block w-[350px] bg-white border-l border-gray-200">
        <div className="sticky top-0 max-h-screen overflow-y-auto overscroll-contain">
          {/* Search Bar */}
          <div className="p-4 border-b border-transparent">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Portal"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-0 rounded-full text-gray-900 placeholder-gray-500 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#23DD9A] focus:ring-opacity-20 transition-all"
              />
            </div>
            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {searchResults.map(u => (
                  <button
                    key={u.uid}
                    onClick={() => navigate(`/profile/${u.uid}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-gray-500">{u.username?.[0]?.toUpperCase() || 'U'}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{u.username}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {u.handle && u.handle.trim() ? `@${u.handle}` : `@${u.uid.slice(0,6)}...${u.uid.slice(-4)}`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Trading Activity */}
          <div className="p-4 pb-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 mb-4">Trading Activity</h3>
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              {recentTrades.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center">No recent trades</div>
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
                      className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors" 
                      onClick={() => navigate(`/market/${trade.marketId}`)}
                    >
                      <div className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${trade.side === 'YES' ? 'bg-[#23DD9A]' : 'bg-[#FF1010]'}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 leading-snug">
                          <span className={trade.side === 'YES' ? 'text-[#23DD9A]' : 'text-[#FF1010]'}>
                            {trade.side}
                          </span>
                          {' '}${trade.amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5 truncate">
                          {marketTitle}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          @{userAddressShort} • {(m as any)?.category || 'Market'} • {formatTimeAgo(tradeDate)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Bottom spacer - minimal */}
          <div className="h-4"></div>
        </div>
      </div>
    </div>
  );
};

export default SocialFeed;