import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useUser } from '../contexts/UserContext';
import { useFirebase } from '../contexts/FirebaseContext';
import { getUserLikedPosts, getUserComments, getUserPosts, getUserReposts, getUserMarkets, formatTimeAgo } from '../services/feed';
import type { UserMarket } from '../services/feed';
import { followUser, unfollowUser, isFollowing, getFollowersCount, getFollowingCount, subscribeToFollowStatus } from '../services/followService';
import type { UserProfile } from '../types';
import type { FeedPost, FeedReply } from '../services/feed';
import FeedCard from './FeedCard';
import { useCustomModal } from '../hooks/useCustomModal';
import CustomModal from './CustomModal';
import InfiniteScrollSentinel from './InfiniteScrollSentinel';

// A single post-shaped loading placeholder.
const SkeletonCard: React.FC = () => (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
        </div>
        <div className="space-y-2">
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-4/5 bg-gray-200 rounded" />
        </div>
    </div>
);

// Empty-state card with an icon, title and hint.
const EmptyState: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
    <div className="text-center py-14 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
            {children}
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
);

// Human-readable label + colour for a market status.
const MARKET_STATUS_STYLES: Record<string, { label: string; className: string }> = {
    open: { label: 'Open', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    expired: { label: 'Ended', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    pending_resolution: { label: 'Pending', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    resolved_yes: { label: 'Resolved YES', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    resolved_no: { label: 'Resolved NO', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

// Compact card for a market shown on a profile's activity tab.
const MarketActivityCard: React.FC<{ market: UserMarket }> = ({ market }) => {
    const status = MARKET_STATUS_STYLES[market.status] || MARKET_STATUS_STYLES.open;
    const yesPct = Math.round(market.probability * 100);

    return (
        <Link
            to={`/market/${market.id}`}
            className="block bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md transition-all"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-sm md:text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2">
                    {market.title}
                </p>
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium border ${status.className}`}>
                    {status.label}
                </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{market.category}</span>
                <span className="text-emerald-600 font-semibold">YES {yesPct}%</span>
                <span className="text-rose-500 font-semibold">NO {100 - yesPct}%</span>
            </div>
        </Link>
    );
};

const Profile: React.FC = () => {
    const { userId } = useParams<{ userId?: string }>();

    const { userProfile, updateUserProfile } = useUser();
    const { user } = useFirebase();
    const { modal, hideModal, showSuccess, showError } = useCustomModal();

    // Profile viewing state
    const [viewingUserId, setViewingUserId] = useState<string | null>(userId || null);
    const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
    const [isViewingOwnProfile, setIsViewingOwnProfile] = useState(true);
    const [isFollowingUser, setIsFollowingUser] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isLoadingFollow, setIsLoadingFollow] = useState(false);
    const [formData, setFormData] = useState<UserProfile>(userProfile || {
        username: 'Anonymous',
        displayName: 'Anonymous',
        handle: '',
        avatar: '',
        avatarUrl: '',
        bio: '',
        xHandle: '',
    });
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'posts' | 'activity'>('posts');

    // Activity tab state
    const [likedPosts, setLikedPosts] = useState<FeedPost[]>([]);
    const [userComments, setUserComments] = useState<Array<FeedReply & { postId: string }>>([]);
    const [createdMarkets, setCreatedMarkets] = useState<UserMarket[]>([]);
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);

    // Posts tab state with infinite scroll
    const [allPosts, setAllPosts] = useState<FeedPost[]>([]);
    const [displayedPosts, setDisplayedPosts] = useState<FeedPost[]>([]);
    const [isLoadingPosts, setIsLoadingPosts] = useState(false);
    const [hasMorePosts, setHasMorePosts] = useState(false);
    const [postsCount, setPostsCount] = useState(0);
    const PAGE_SIZE = 20;

    // Fetch both user's posts and reposts - Initial load
    useEffect(() => {
        const fetchUserPostsAndReposts = async () => {
            if (!viewingUserId) return;

            setIsLoadingPosts(true);
            try {
                // Fetch all posts and reposts at once
                const [ownPosts, repostedPosts] = await Promise.all([
                    getUserPosts(viewingUserId),
                    getUserReposts(viewingUserId)
                ]);

                // Combine and deduplicate posts (remove duplicates based on post.id)
                const allPostsMap = new Map<string, FeedPost>();

                // Add own posts
                ownPosts.forEach(post => {
                    allPostsMap.set(post.id, post);
                });

                // Add reposts (they might be duplicates, so we use the original)
                repostedPosts.forEach(post => {
                    if (!allPostsMap.has(post.id)) {
                        allPostsMap.set(post.id, post);
                    }
                });

                // Convert to array and sort by "most recent activity":
                // For reposts, use repostAt; otherwise use createdAt
                const combinedPosts = Array.from(allPostsMap.values());
                combinedPosts.sort((a: any, b: any) => {
                    const aDate = (a.repostAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0)).getTime();
                    const bDate = (b.repostAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0)).getTime();
                    return bDate - aDate;
                });

                setAllPosts(combinedPosts);
                setPostsCount(combinedPosts.length);

                // Display first page
                const initialPosts = combinedPosts.slice(0, PAGE_SIZE);
                setDisplayedPosts(initialPosts);
                setHasMorePosts(combinedPosts.length > PAGE_SIZE);
            } catch (error) {
                console.error('Error fetching posts:', error);
            } finally {
                setIsLoadingPosts(false);
            }
        };

        if (activeTab === 'posts') {
            setAllPosts([]);
            setDisplayedPosts([]);
            setHasMorePosts(false);
            fetchUserPostsAndReposts();
        }
    }, [viewingUserId, activeTab]);

    // Load more posts function
    const loadMorePosts = () => {
        if (!hasMorePosts || isLoadingPosts) return;

        const nextPosts = allPosts.slice(displayedPosts.length, displayedPosts.length + PAGE_SIZE);
        if (nextPosts.length > 0) {
            setDisplayedPosts(prev => [...prev, ...nextPosts]);
            setHasMorePosts(displayedPosts.length + nextPosts.length < allPosts.length);
        } else {
            setHasMorePosts(false);
        }
    };

    // Determine if viewing own profile or another user's profile
    useEffect(() => {
        if (userId && userId !== user?.uid) {
            setViewingUserId(userId);
            setIsViewingOwnProfile(false);
        } else {
            setViewingUserId(user?.uid || null);
            setIsViewingOwnProfile(true);
        }
    }, [userId, user?.uid]);

    // Load viewing profile data - refresh when userId changes
    useEffect(() => {
        const loadViewingProfile = async () => {
            if (!viewingUserId) {
                setViewingProfile(null);
                return;
            }

            if (isViewingOwnProfile && userProfile) {
                setViewingProfile(userProfile);
                return;
            }

            if (!isViewingOwnProfile) {
                try {
                    // Always fetch fresh data from Firestore server (bypass cache)
                    // Clear any cached profile first to force fresh fetch
                    setViewingProfile(null);

                    const userDocRef = doc(db, 'users', viewingUserId);
                    const userDoc = await getDoc(userDocRef);
                    let avatar = '';
                    let username = 'Anonymous';
                    let displayName = 'Anonymous';
                    let handle = '';
                    let bio = '';
                    let xHandle = '';

                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        // Use same avatar logic as search: data.avatar || data.avatarUrl
                        avatar = data.avatar || data.avatarUrl || '';
                        username = data.username || data.displayName || 'Anonymous';
                        displayName = data.displayName || data.username || 'Anonymous';
                        handle = data.handle || '';
                        bio = data.bio || '';
                        xHandle = data.xHandle || '';
                    }

                    // If no avatar in users collection, try to get from latest post
                    if (!avatar && viewingUserId) {
                        try {
                            const postsQuery = query(
                                collection(db, 'feed'),
                                where('uid', '==', viewingUserId),
                                orderBy('createdAt', 'desc'),
                                limit(1)
                            );
                            // Force fresh fetch from server for posts too
                            const postsSnapshot = await getDocs(postsQuery);
                            if (!postsSnapshot.empty) {
                                const latestPost = postsSnapshot.docs[0].data();
                                const postAvatar = latestPost.avatarUrl || latestPost.avatar || '';
                                if (postAvatar) {
                                    avatar = postAvatar;
                                }
                            }
                        } catch (postError: any) {
                            // If index error, try without orderBy
                            if (postError?.code === 'failed-precondition') {
                                try {
                                    const simplePostsQuery = query(
                                        collection(db, 'feed'),
                                        where('uid', '==', viewingUserId),
                                        limit(1)
                                    );
                                    const simpleSnapshot = await getDocs(simplePostsQuery);
                                    if (!simpleSnapshot.empty) {
                                        // Sort client-side by createdAt desc
                                        const sortedDocs = simpleSnapshot.docs.sort((a, b) => {
                                            const aTime = a.data().createdAt?.toDate?.()?.getTime() || 0;
                                            const bTime = b.data().createdAt?.toDate?.()?.getTime() || 0;
                                            return bTime - aTime;
                                        });
                                        const latestPost = sortedDocs[0].data();
                                        const postAvatar = latestPost.avatarUrl || latestPost.avatar || '';
                                        if (postAvatar) {
                                            avatar = postAvatar;
                                        }
                                    }
                                } catch (fallbackError) {
                                    console.debug('Could not fetch avatar from posts:', fallbackError);
                                }
                            } else {
                                console.debug('Could not fetch avatar from posts:', postError);
                            }
                        }
                    }

                    const freshProfile: UserProfile = {
                        uid: viewingUserId,
                        username: username,
                        displayName: displayName,
                        handle: handle,
                        avatar: avatar,
                        avatarUrl: avatar, // Ensure both fields have same value
                        bio: bio,
                        xHandle: xHandle,
                    };
                    setViewingProfile(freshProfile);
                } catch (error) {
                    console.error('Error loading viewing profile:', error);
                    setViewingProfile(null);
                }
            }
        };

        loadViewingProfile();
    }, [viewingUserId, isViewingOwnProfile, userProfile, userId]); // userId ensures fresh fetch on route change

    // Load follow status and counts with real-time updates
    useEffect(() => {
        if (!user?.uid || !viewingUserId || isViewingOwnProfile) {
            setIsFollowingUser(false);
            return;
        }

        let unsubscribeFollowStatus: (() => void) | undefined;
        let unsubscribeUserDoc: (() => void) | undefined;

        const loadFollowData = async () => {
            try {
                const [followingStatus, followers, following] = await Promise.all([
                    isFollowing(user.uid, viewingUserId),
                    getFollowersCount(viewingUserId),
                    getFollowingCount(viewingUserId)
                ]);

                setIsFollowingUser(followingStatus);
                setFollowersCount(followers);
                setFollowingCount(following);

                // Subscribe to follow status changes
                unsubscribeFollowStatus = subscribeToFollowStatus(user.uid, viewingUserId, setIsFollowingUser);

                // Subscribe to user document changes for real-time count updates
                const userDocRef = doc(db, 'users', viewingUserId);
                unsubscribeUserDoc = onSnapshot(userDocRef, (doc) => {
                    if (doc.exists()) {
                        const data = doc.data();
                        setFollowersCount(data.followersCount || 0);
                        setFollowingCount(data.followingCount || 0);
                    }
                }, (error) => {
                    console.error('Error subscribing to user doc:', error);
                });
            } catch (error) {
                console.error('Error loading follow data:', error);
            }
        };

        loadFollowData();

        return () => {
            if (unsubscribeFollowStatus) unsubscribeFollowStatus();
            if (unsubscribeUserDoc) unsubscribeUserDoc();
        };
    }, [user?.uid, viewingUserId, isViewingOwnProfile]);

    // Load own profile counts
    useEffect(() => {
        if (!user?.uid || !isViewingOwnProfile) return;

        const loadOwnCounts = async () => {
            try {
                const [followers, following] = await Promise.all([
                    getFollowersCount(user.uid),
                    getFollowingCount(user.uid)
                ]);
                setFollowersCount(followers);
                setFollowingCount(following);
            } catch (error) {
                console.error('Error loading own counts:', error);
            }
        };

        loadOwnCounts();
    }, [user?.uid, isViewingOwnProfile]);

    useEffect(() => {
        // Update form data when user profile changes - don't override if already editing
        if (userProfile && userProfile.username && userProfile.username !== 'Anonymous') {
            setFormData({ ...userProfile });
        }
    }, [userProfile?.username, userProfile?.handle]); // Include handle in dependencies

    // Load the viewed user's activity (likes, comments, created markets).
    // Keyed on viewingUserId so it reflects whoever's profile is open, not the
    // signed-in user.
    useEffect(() => {
        const fetchUserActivity = async () => {
            if (!viewingUserId) return;

            setIsLoadingActivity(true);
            try {
                // Fetch more posts to catch likes (50 posts checked, returns all liked ones)
                const [liked, comments, markets] = await Promise.all([
                    getUserLikedPosts(viewingUserId, 50),
                    getUserComments(viewingUserId, 50),
                    getUserMarkets(viewingUserId),
                ]);

                setLikedPosts(liked);
                setUserComments(comments);
                setCreatedMarkets(markets);
            } catch (error) {
                console.error('Error fetching activity:', error);
            } finally {
                setIsLoadingActivity(false);
            }
        };

        if (activeTab === 'activity') {
            setLikedPosts([]);
            setUserComments([]);
            setCreatedMarkets([]);
            fetchUserActivity();
        }
    }, [viewingUserId, activeTab]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Compress and convert to base64 (max 200KB)
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 400; // Max width/height
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                // Convert to base64 with 0.7 quality (smaller size)
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                setFormData(prev => ({ ...prev, avatar: compressedBase64 }));
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const uid = userProfile?.uid ?? user?.uid;
            if (!uid) {
                showError('Not Signed In', 'Please wait for your session to load before updating your profile.');
                return;
            }

            const profileToSave: UserProfile = {
                ...formData,
                uid,
            };

            await updateUserProfile(profileToSave, uid);

            // Show success message
            showSuccess('Profile Updated!', 'Your profile has been saved successfully.');

            setIsEditModalOpen(false);
        } catch (error) {
            console.error('Failed to update profile:', error);
            showError('Update Failed', error instanceof Error ? error.message : 'Failed to update your profile. Please try again.');
        }
    };

    const handleCancel = () => {
        setFormData(userProfile);
        setIsEditModalOpen(false);
    }

    const handleFollow = async () => {
        if (!user?.uid || !viewingUserId || isViewingOwnProfile) return;

        setIsLoadingFollow(true);
        try {
            if (isFollowingUser) {
                await unfollowUser(user.uid, viewingUserId);
                showSuccess('Unfollowed', `You unfollowed ${viewingProfile?.username || 'user'}`);
            } else {
                await followUser(user.uid, viewingUserId);
                showSuccess('Following', `You are now following ${viewingProfile?.username || 'user'}`);
            }
        } catch (error: any) {
            showError('Error', error.message || 'Failed to update follow status');
        } finally {
            setIsLoadingFollow(false);
        }
    };

    // Live subscribe to viewed user's latest profile
    useEffect(() => {
      // If a specific userId in route and it's not own profile, subscribe to users/{userId}
      if (viewingUserId && (!user?.uid || viewingUserId !== user.uid)) {
        const unsub = onSnapshot(doc(db, 'users', viewingUserId), (snap) => {
          if (snap.exists()) {
            const data = snap.data() as any;
            setViewingProfile({ ...(data as any), uid: viewingUserId } as UserProfile);
          }
        });
        return () => unsub();
      }
    }, [viewingUserId, user?.uid]);

    const profile = isViewingOwnProfile ? userProfile : viewingProfile;
    const displayNameForHeadings = profile?.username || 'This user';
    const possessive = isViewingOwnProfile ? 'Your' : `${displayNameForHeadings}'s`;
    const handleText = profile?.handle && profile.handle.trim() ? `@${profile.handle}` : '@anonymous';
    const hasCustomAvatar = !!profile?.avatar && profile.avatar.trim() !== '' && !profile.avatar.startsWith('blob:');

    return (
        <div className="min-h-screen bg-[#f8f9fa]">
            <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 md:py-8">
                {/* Profile Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Cover */}
                    <div className="relative h-36 md:h-52 bg-gradient-to-br from-gray-900 via-gray-800 to-black">
                        <div className="absolute inset-0 opacity-10" style={{
                            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                            backgroundSize: '32px 32px'
                        }} />
                        <img
                            src="/rivarly-logo.png"
                            alt=""
                            aria-hidden="true"
                            className="absolute right-5 bottom-4 h-5 md:h-7 opacity-25 invert pointer-events-none"
                        />
                    </div>

                    {/* Body — relative z-10 so the avatar/content paints above the
                        positioned cover (a positioned sibling would otherwise cover it) */}
                    <div className="relative z-10 px-4 md:px-8 pb-6">
                        {/* Avatar + primary action */}
                        <div className="flex items-end justify-between -mt-12 md:-mt-16">
                            {hasCustomAvatar ? (
                                <img
                                    src={profile!.avatar}
                                    alt={profile?.username || 'Profile'}
                                    className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-white shadow-lg object-cover bg-white"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            ) : (
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-white shadow-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                                    <svg className="w-12 h-12 md:w-16 md:h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                            )}

                            <div className="mb-1">
                                {isViewingOwnProfile ? (
                                    <button
                                        onClick={() => setIsEditModalOpen(true)}
                                        className="px-5 py-2 rounded-full text-sm font-semibold border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:!text-white transition-colors"
                                    >
                                        Edit Profile
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleFollow}
                                        disabled={isLoadingFollow || !user?.uid}
                                        className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                                            isFollowingUser
                                                ? 'border-2 border-gray-900 text-gray-900 hover:bg-gray-50'
                                                : 'bg-gray-900 !text-white hover:bg-black'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isLoadingFollow ? (
                                            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                                        ) : isFollowingUser ? 'Following' : 'Follow'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Name + handle */}
                        <div className="mt-4">
                            <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                                {profile?.username || 'Anonymous'}
                            </h1>
                            <p className="text-sm text-gray-500 font-medium">{handleText}</p>
                        </div>

                        {/* Bio */}
                        <p className="mt-3 text-sm md:text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {profile?.bio || 'No bio yet.'}
                        </p>

                        {/* X handle */}
                        {profile?.xHandle && (
                            <a
                                href={`https://x.com/${profile.xHandle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                @{profile.xHandle}
                            </a>
                        )}

                        {/* Stats */}
                        <div className="mt-5 grid grid-cols-3 divide-x divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                            <div className="px-3 py-3 text-center">
                                <div className="text-lg font-bold text-gray-900">{postsCount}</div>
                                <div className="text-xs text-gray-500 mt-0.5">Posts</div>
                            </div>
                            <button
                                onClick={() => { /* TODO: open followers list */ }}
                                className="px-3 py-3 text-center hover:bg-gray-100 transition-colors"
                            >
                                <div className="text-lg font-bold text-gray-900">{followersCount}</div>
                                <div className="text-xs text-gray-500 mt-0.5">Followers</div>
                            </button>
                            <button
                                onClick={() => { /* TODO: open following list */ }}
                                className="px-3 py-3 text-center hover:bg-gray-100 transition-colors"
                            >
                                <div className="text-lg font-bold text-gray-900">{followingCount}</div>
                                <div className="text-xs text-gray-500 mt-0.5">Following</div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mt-6 flex justify-center">
                    <div className="inline-flex p-1 bg-gray-100 rounded-full">
                        {(['posts', 'activity'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-8 py-2 rounded-full text-sm font-semibold capitalize transition-all ${
                                    activeTab === tab
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="mt-6">
                    {/* Posts Tab */}
                    {activeTab === 'posts' && (
                        <div>
                            {isLoadingPosts ? (
                                <div className="space-y-4">
                                    {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                                </div>
                            ) : displayedPosts.length > 0 ? (
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    {displayedPosts.map((post, index) => (
                                        <div key={post.id} className={index > 0 ? "border-t border-gray-100" : ""}>
                                            <FeedCard post={post} />
                                        </div>
                                    ))}
                                    <InfiniteScrollSentinel
                                        onIntersect={loadMorePosts}
                                        isLoading={isLoadingPosts}
                                        hasMore={hasMorePosts}
                                    />
                                </div>
                            ) : (
                                <EmptyState title="No posts yet" subtitle="Posts you create will show up here.">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </EmptyState>
                            )}
                        </div>
                    )}

                    {/* Activity Tab */}
                    {activeTab === 'activity' && (
                        <div className="space-y-8">
                            {isLoadingActivity ? (
                                <div className="space-y-4">
                                    {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                                </div>
                            ) : (
                                <>
                                    {/* Markets Section — the user's market/bet activity */}
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l3-3 3 3 5-6" />
                                            </svg>
                                            {possessive} markets
                                            <span className="text-gray-400 font-normal">({createdMarkets.length})</span>
                                        </h3>
                                        {createdMarkets.length > 0 ? (
                                            <div className="space-y-3">
                                                {createdMarkets.map(market => (
                                                    <MarketActivityCard key={market.id} market={market} />
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState
                                                title="No markets yet"
                                                subtitle={isViewingOwnProfile ? 'Markets you create will appear here.' : 'This user has not created any markets yet.'}
                                            >
                                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l3-3 3 3 5-6" />
                                                </svg>
                                            </EmptyState>
                                        )}
                                    </div>

                                    {/* Liked Posts Section */}
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                            </svg>
                                            Liked posts
                                            <span className="text-gray-400 font-normal">({likedPosts.length})</span>
                                        </h3>
                                        {likedPosts.length > 0 ? (
                                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                                {likedPosts.map((post, index) => (
                                                    <div key={post.id} className={index > 0 ? "border-t border-gray-100" : ""}>
                                                        <FeedCard post={post} />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState title="No liked posts yet" subtitle={isViewingOwnProfile ? 'Posts you like will appear here.' : 'Posts this user likes will appear here.'}>
                                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                </svg>
                                            </EmptyState>
                                        )}
                                    </div>

                                    {/* Comments Section */}
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                            {possessive} comments
                                            <span className="text-gray-400 font-normal">({userComments.length})</span>
                                        </h3>
                                        {userComments.length > 0 ? (
                                            <div className="space-y-3">
                                                {userComments.map(comment => (
                                                    <div key={comment.id} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                                                                <span className="text-white font-semibold text-sm">
                                                                    {comment.displayName.charAt(0).toUpperCase()}
                                                                </span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1 text-sm">
                                                                    <span className="text-gray-900 font-semibold truncate">{comment.displayName}</span>
                                                                    <span className="text-gray-400 truncate">{comment.handle}</span>
                                                                    <span className="text-gray-300">•</span>
                                                                    <span className="text-gray-400">{formatTimeAgo(comment.createdAt)}</span>
                                                                </div>
                                                                <p className="text-gray-900 text-sm mb-2 whitespace-pre-wrap break-words">{comment.text}</p>
                                                                <a href={`/post/${comment.postId}`} className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                                                                    Replying to post #{comment.postId.slice(0, 8)}
                                                                </a>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState title="No comments yet" subtitle={isViewingOwnProfile ? 'Your comments will appear here.' : 'This user has not commented yet.'}>
                                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                </svg>
                                            </EmptyState>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Profile Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9998] p-4">
                    <div className="bg-white rounded-3xl border border-gray-200 p-4 md:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl relative">
                        {/* Close Button */}
                        <button
                            onClick={() => setIsEditModalOpen(false)}
                            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 md:mb-8 pr-8">Edit Profile</h3>

                        <form onSubmit={handleSave} className="space-y-4 md:space-y-6">
                            {/* Avatar preview */}
                            <div className="flex items-center gap-4">
                                {formData.avatar && !formData.avatar.startsWith('blob:') ? (
                                    <img src={formData.avatar} alt="Avatar preview" className="w-16 h-16 rounded-2xl object-cover border border-gray-200" />
                                ) : (
                                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                )}
                                <label htmlFor="avatar" className="cursor-pointer px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                                    Change photo
                                    <input
                                        type="file"
                                        id="avatar"
                                        name="avatar"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            {/* Display Name */}
                            <div>
                                <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">Display Name</label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-gray-900 placeholder-gray-400"
                                    placeholder="Enter display name"
                                />
                            </div>

                            {/* Username Handle */}
                            <div>
                                <label htmlFor="handle" className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-gray-500">@</span>
                                    <input
                                        type="text"
                                        id="handle"
                                        name="handle"
                                        value={formData.handle || ''}
                                        onChange={handleInputChange}
                                        className="w-full pl-8 pr-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-gray-900 placeholder-gray-400"
                                        placeholder="johndoe"
                                        pattern="[a-zA-Z0-9_]+"
                                        title="Only letters, numbers, and underscores allowed"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2">This will be your unique @username. Letters, numbers, and underscores only.</p>
                            </div>

                            {/* Bio */}
                            <div>
                                <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-2">Bio</label>
                                <textarea
                                    id="bio"
                                    name="bio"
                                    value={formData.bio || ''}
                                    onChange={handleInputChange}
                                    rows={4}
                                    maxLength={280}
                                    className="w-full px-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-gray-900 placeholder-gray-400 resize-none"
                                    placeholder="Tell us about yourself..."
                                />
                                <div className="text-xs text-gray-500 mt-2">
                                    {(formData.bio || '').length}/280 characters
                                </div>
                            </div>

                            {/* X Handle */}
                            <div>
                                <label htmlFor="xHandle" className="block text-sm font-semibold text-gray-700 mb-2">X Handle</label>
                                <input
                                    type="text"
                                    id="xHandle"
                                    name="xHandle"
                                    value={formData.xHandle || ''}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-gray-900 placeholder-gray-400"
                                    placeholder="username"
                                    pattern="^@?[A-Za-z0-9_]{1,15}$"
                                />
                                <div className="text-xs text-gray-500 mt-2">
                                    Enter without @ symbol
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-2 md:pt-4">
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="w-full sm:w-auto px-6 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all duration-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="w-full sm:w-auto px-6 py-3 bg-black hover:bg-gray-800 !text-white text-sm font-semibold rounded-xl transition-all duration-200"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
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
        </div>
    );
};

export default Profile;
