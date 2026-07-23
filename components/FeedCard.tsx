import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toggleLike, replyToPost, subscribeToReplies, formatTimeAgo, deletePost, deleteReply, repost } from '../services/feed';
import { useFirebase } from '../contexts/FirebaseContext';
import { useCustomModal } from '../hooks/useCustomModal';
import CustomModal from './CustomModal';
import { parseTextWithMarketLinks } from '../utils/marketLinkDetector';
import type { FeedPost, FeedReply } from '../services/feed';

// Simple placeholder avatar - no external image generation
const getAvatarFallback = (displayName?: string) => {
  if (!displayName) return '?';
  return displayName.slice(0, 2).toUpperCase();
};

interface FeedCardProps {
  post: FeedPost;
  onReply?: (postId: string) => void;
  autoExpandReplies?: boolean; // Auto-expand comments when viewing post detail
  disableNavigation?: boolean; // Disable card click navigation (for detail page)
}

const FeedCard: React.FC<FeedCardProps> = ({ post, onReply, autoExpandReplies = false, disableNavigation = false }) => {
  const navigate = useNavigate();
  const { user, userProfile } = useFirebase();
  const { modal, hideModal, showDelete, showError } = useCustomModal();
  
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [isReposted, setIsReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [showReplies, setShowReplies] = useState(autoExpandReplies);
  const [replies, setReplies] = useState<FeedReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  // Check initial like status from post data
  useEffect(() => {
    if (user?.uid) {
      // Check likedBy array in post data
      const userLiked = post.likedBy?.includes(user.uid) || false;
      setIsLiked(userLiked);
      
      // Check if user has reposted
      const userReposted = post.repostedBy?.includes(user.uid) || false;
      setIsReposted(userReposted);
    }
  }, [post.id, user?.uid, post.repostedBy, post.likedBy]);

  // Auto-load replies if autoExpandReplies is true
  useEffect(() => {
    if (autoExpandReplies && replies.length === 0) {
      setIsLoadingReplies(true);
      subscribeToReplies(post.id, (loadedReplies) => {
        setReplies(loadedReplies);
        setIsLoadingReplies(false);
      });
    }
  }, [autoExpandReplies, post.id, replies.length]);

  const handleLike = useCallback(async () => {
    if (!user) return;

    if (isActionLoading) return;
    
    setIsActionLoading(true);
    try {
      const result = await toggleLike(post.id, user.uid);
      setIsLiked(result.liked);
      setLikeCount(prev => prev + (result.liked ? 1 : -1));
    } catch (error) {
      console.error('Error toggling like:', error);
      // Silent fail for likes - too frequent for modals
    } finally {
      setIsActionLoading(false);
    }
  }, [post.id, user, isActionLoading, showError]);

  const handleRepost = useCallback(async () => {
    if (!user) return;

    if (isActionLoading) return;

    setIsActionLoading(true);
    try {
      const profileInfo = {
        displayName: userProfile?.username || 'Anonymous',
        handle: (userProfile?.handle && userProfile.handle.trim())
          ? userProfile.handle
          : user.uid.slice(0, 6),
        avatarUrl: userProfile?.avatar || ''
      };
      
      const result = await repost(post.id, user.uid, profileInfo);
      setIsReposted(result.reposted);
      setRepostCount(result.newCount);
    } catch (error) {
      console.error('Error reposting:', error);
      showError('Repost Failed', 'Failed to repost this post.');
    } finally {
      setIsActionLoading(false);
    }
  }, [post.id, user, userProfile, isActionLoading, showError]);


  const handleReply = useCallback(() => {
    setShowReplies(prev => !prev);
    if (!showReplies && replies.length === 0) {
      // Load replies when opening
      setIsLoadingReplies(true);
      subscribeToReplies(post.id, (loadedReplies) => {
        setReplies(loadedReplies);
        setIsLoadingReplies(false);
      });
    }
  }, [post.id, showReplies, replies.length]);

  const handleReplySubmit = useCallback(async () => {
    if (!user) return;

    if (!replyText.trim() || isActionLoading) return;

    setIsActionLoading(true);
    try {
      await replyToPost({
        postId: post.id,
        uid: user.uid,
        displayName: userProfile?.username || 'Anonymous',
        handle: (userProfile?.handle && userProfile.handle.trim())
          ? userProfile.handle
          : user.uid.slice(0, 6),
        avatarUrl: userProfile?.avatar || '',
        text: replyText.trim(),
        // file upload not supported yet
      });

      setReplyText('');
      // Silent success - UI updates automatically
    } catch (error) {
      console.error('Error posting reply:', error);
      showError('Reply Failed', 'Could not post reply.');
    } finally {
      setIsActionLoading(false);
    }
  }, [user, userProfile, replyText, post.id, isActionLoading, showError]);

  const handleShare = useCallback(() => {
    const shareText = `Check out this post: ${post.text.substring(0, 50)}${post.text.length > 50 ? '...' : ''}`;
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      // Silent success - copy works
    }).catch(() => {
      showError('Copy Failed', 'Failed to copy link to clipboard');
    });
  }, [post.id, post.text, showError]);

  const toggleReplies = useCallback(() => {
    setShowReplies(!showReplies);
  }, [showReplies]);

  const handleProfileClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const targetUid = post.uid || (post as any).userId;
    if (targetUid) {
      navigate(`/profile/${targetUid}`);
    } else {
      navigate('/profile');
    }
  }, [navigate, post]);

  const handleDeletePost = useCallback(async () => {
    if (!user?.uid) return;
    
    showDelete(
      'Delete Post?',
      'Are you sure you want to delete this post? This action cannot be undone.',
      async () => {
        try {
          await deletePost(post.id, user.uid);
          // Refresh page or remove post from UI
          window.location.reload();
        } catch (error: any) {
          showError('Delete Failed', error.message || 'Failed to delete post');
        }
      },
      'Delete',
      'Cancel'
    );
  }, [post.id, user?.uid, showDelete, showError]);

  const handleDeleteReply = useCallback(async (replyId: string) => {
    if (!user?.uid) return;
    
    showDelete(
      'Delete Comment?',
      'Are you sure you want to delete this comment? This action cannot be undone.',
      async () => {
        try {
          await deleteReply(post.id, replyId, user.uid);
          // Remove reply from local state
          setReplies(prev => prev.filter(r => r.id !== replyId));
        } catch (error: any) {
          showError('Delete Failed', error.message || 'Failed to delete comment');
        }
      },
      'Delete',
      'Cancel'
    );
  }, [post.id, user?.uid, showDelete, showError]);

  const isOwnPost = user?.uid === post.uid;

  // Handle image click for modal
  const handleImageClick = useCallback((index: number) => {
    setSelectedImageIndex(index);
  }, []);

  const closeImageModal = useCallback(() => {
    setSelectedImageIndex(null);
  }, []);

  // Handle card click to navigate to post detail
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if (disableNavigation) return; // Don't navigate if we're already on detail page
    
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('a') || 
      target.closest('input') || 
      target.closest('textarea') ||
      target.tagName === 'IMG' // Don't navigate when clicking images (they have their own modal)
    ) {
      return;
    }
    navigate(`/post/${post.id}`);
  }, [navigate, post.id, disableNavigation]);

  return (
    <>
      <div 
        className={`bg-background-card p-6 hover:bg-background-hover transition-all ${!disableNavigation ? 'cursor-pointer' : ''}`}
        onClick={handleCardClick}
      >
      {/* RT Header - Show if current user has reposted this */}
      {user && post.repostedBy?.includes(user.uid) && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
          <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-semibold text-green-400">
            You reposted
          </span>
        </div>
      )}
      
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div 
          className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
          onClick={handleProfileClick}
        >
          {post.avatarUrl ? (
            <img 
              src={post.avatarUrl} 
              alt={`${post.displayName}'s Avatar`} 
              className="h-12 w-12 rounded-full object-cover ring-2 ring-border-default" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="h-12 w-12 bg-background-active rounded-full flex items-center justify-center ring-2 ring-border-default">
              <svg className="w-6 h-6 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-grow min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span 
              className="text-text-primary font-bold text-sm cursor-pointer hover:underline"
              onClick={handleProfileClick}
            >
              {post.displayName}
            </span>
            <span className="text-text-secondary text-sm">
              {(post.handle && post.handle.trim())
                ? `@${post.handle}`
                : (post.uid ? `@${post.uid.slice(0, 6)}` : '@anonymous')}
            </span>
            <span className="text-text-tertiary text-sm">·</span>
            <span className="text-text-secondary text-sm">{formatTimeAgo(post.createdAt)}</span>
            
            {/* Delete button for own posts */}
            {isOwnPost && (
              <button
                onClick={handleDeletePost}
                className="ml-auto text-text-tertiary hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                title="Delete post"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Text content with market links */}
          <div className="text-text-primary text-base mb-3 whitespace-pre-wrap leading-relaxed">
            {(() => {
              const parts = parseTextWithMarketLinks(post.text);
              return parts.map((part, index) => {
                if (part.type === 'market-link' && part.marketId) {
                  return (
                    <span
                      key={index}
                      className="text-blue-400 hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/market/${part.marketId}`);
                      }}
                    >
                      {part.content}
                    </span>
                  );
                }
                return <span key={index}>{part.content}</span>;
              });
            })()}
          </div>
          
          {/* Media - Moved before widgets so photos appear first */}
          {post.media && post.media.length > 0 && (
            <div className="mb-4">
              {post.media.length === 1 ? (
                <div className="rounded-xl overflow-hidden cursor-pointer hover:opacity-95 transition-opacity border border-border-default">
                  {post.media[0].type === 'video' ? (
                    <video 
                      src={post.media[0].url} 
                      controls 
                      className="w-full max-h-[600px] object-contain bg-background-hover"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <img 
                      src={post.media[0].url} 
                      alt="Post media" 
                      className="w-full max-h-[600px] object-contain bg-background-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImageClick(0);
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {post.media.map((media, index) => (
                    <div key={index} className="rounded-xl overflow-hidden cursor-pointer hover:opacity-95 transition-opacity border border-border-default">
                      {media.type === 'video' ? (
                        <video 
                          src={media.url} 
                          controls 
                          className="w-full h-64 object-contain bg-background-hover"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <img 
                          src={media.url} 
                          alt={`Post media ${index + 1}`} 
                          className="w-full h-64 object-cover"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleImageClick(index);
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Market tag */}
          {post.marketId && (
            <div className="mb-4 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-blue-400 text-sm font-semibold">Market</span>
              </div>
              <div className="text-text-primary text-sm font-medium">Market #{post.marketId.slice(0, 8)}...</div>
            </div>
          )}
          
          {/* Action bar */}
          <div className="flex items-center gap-6 pt-3 border-t border-border-default">
            {/* Reply */}
            <button 
              onClick={handleReply}
              className="flex items-center gap-2 text-text-secondary hover:text-blue-400 hover:bg-blue-500/10 transition-colors p-2 rounded-lg group"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm font-medium">{post.replyCount}</span>
            </button>
            
            {/* Like */}
            <button 
              onClick={handleLike}
              disabled={isActionLoading}
              className={`flex items-center gap-2 transition-colors p-2 rounded-lg group ${
                isLiked ? 'text-red-500 hover:bg-red-500/10' : 'text-text-secondary hover:text-red-500 hover:bg-red-500/10'
              } ${isActionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg 
                className="w-5 h-5 group-hover:scale-110 transition-transform" 
                fill={isLiked ? 'currentColor' : 'none'} 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                />
              </svg>
              <span className="text-sm font-medium">{likeCount}</span>
            </button>
            
            {/* Repost */}
            <button 
              onClick={handleRepost}
              disabled={isActionLoading}
              className={`flex items-center gap-2 transition-colors p-2 rounded-lg group ${
                isReposted ? 'text-green-400 hover:bg-green-500/10' : 'text-text-secondary hover:text-green-400 hover:bg-green-500/10'
              } ${isActionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg 
                className={`w-5 h-5 group-hover:scale-110 transition-transform ${isReposted ? 'fill-current' : ''}`} 
                fill={isReposted ? 'currentColor' : 'none'} 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                />
              </svg>
              <span className="text-sm font-medium">{repostCount}</span>
            </button>
            
            {/* Share */}
            <button 
              onClick={handleShare}
              className="flex items-center gap-2 text-text-secondary hover:text-green-400 hover:bg-green-500/10 transition-colors p-2 rounded-lg group"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
            </button>
          </div>
          
          {/* Comment Section */}
          {showReplies && (
            <div className="mt-4 pt-4 border-t border-border-default">
              {/* Comment Input */}
              <div className="flex gap-3 mb-4">
                {/* User's Own Avatar in Reply Input */}
                {userProfile?.avatar ? (
                  <img 
                    src={userProfile.avatar} 
                    alt="Your Avatar" 
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-border-default" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 bg-background-active rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply..."
                    className="w-full px-3 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary placeholder-gray-500 text-sm focus:outline-none focus:border-blue-400 focus:bg-background-card resize-none transition-colors"
                    rows={2}
                  />
                  <div className="flex justify-end mt-2 gap-2">
                    <button
                      onClick={() => setShowReplies(false)}
                      className="px-4 py-2 text-sm text-text-secondary hover:text-white hover:bg-background-hover rounded-lg transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReplySubmit}
                      disabled={!replyText.trim() || isActionLoading}
                      className="px-4 py-2 bg-inverse !text-inverse-ink text-sm font-semibold rounded-lg hover:bg-inverse-hover disabled:bg-background-active disabled:text-text-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      {isActionLoading ? 'Posting...' : 'Reply'}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Comments List */}
              {replies.length > 0 && (
                <div className="space-y-3">
                  {replies.map((reply) => {
                    const isOwnReply = user?.uid === reply.uid;
                    return (
                      <div key={reply.id} className="flex gap-3 p-3 rounded-lg hover:bg-background-hover transition-colors">
                        {/* Reply Avatar - Clickable */}
                        <div
                          className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                          onClick={(e) => {
                            e.stopPropagation();
                            const replyUid = reply.uid;
                            if (replyUid) {
                              navigate(`/profile/${replyUid}`);
                            }
                          }}
                        >
                          {reply.avatarUrl ? (
                            <img 
                              src={reply.avatarUrl} 
                              alt={`${reply.displayName}'s Avatar`} 
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-border-default" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 bg-background-active rounded-full flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span 
                              className="text-sm font-bold text-text-primary cursor-pointer hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                const replyUid = reply.uid;
                                if (replyUid) {
                                  navigate(`/profile/${replyUid}`);
                                }
                              }}
                            >
                              {reply.displayName}
                            </span>
                            <span className="text-xs text-text-secondary">{reply.handle}</span>
                            <span className="text-xs text-text-tertiary">·</span>
                            <span className="text-xs text-text-secondary">{formatTimeAgo(reply.createdAt)}</span>
                            
                            {/* Delete button for own comments */}
                            {isOwnReply && (
                              <button
                                onClick={() => handleDeleteReply(reply.id)}
                                className="ml-auto text-text-tertiary hover:text-red-500 transition-colors p-1 rounded hover:bg-red-500/10"
                                title="Delete comment"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{reply.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Image Modal */}
    {selectedImageIndex !== null && post.media && post.media[selectedImageIndex] && (
      <div 
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
        onClick={closeImageModal}
      >
        <button
          onClick={closeImageModal}
          className="absolute top-6 right-6 text-white hover:text-gray-300 transition-all p-3 rounded-full bg-black/50 hover:bg-black/70 z-10"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* Navigation arrows for multiple images */}
        {post.media.length > 1 && (
          <>
            {selectedImageIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImageIndex(selectedImageIndex - 1);
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 text-white hover:scale-110 transition-transform p-3 bg-black/50 hover:bg-black/70 rounded-full shadow-xl"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {selectedImageIndex < post.media.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImageIndex(selectedImageIndex + 1);
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-white hover:scale-110 transition-transform p-3 bg-black/50 hover:bg-black/70 rounded-full shadow-xl"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </>
        )}
        
        <img
          src={post.media[selectedImageIndex].url}
          alt={`Full size ${selectedImageIndex + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        
        {/* Image counter */}
        {post.media.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white px-5 py-2 rounded-full text-sm font-medium shadow-lg">
            {selectedImageIndex + 1} / {post.media.length}
          </div>
        )}
      </div>
    )}

    {/* Custom Modal */}
    <CustomModal
      isOpen={modal.isOpen}
      onClose={hideModal}
      type={modal.type}
      title={modal.title}
      message={modal.message}
      confirmText={modal.confirmText}
      cancelText={modal.cancelText}
      onConfirm={modal.onConfirm}
    />
  </>
  );
};

export default FeedCard;
