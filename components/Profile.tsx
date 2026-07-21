import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useUser } from '../contexts/UserContext';
import { useFirebase } from '../contexts/FirebaseContext';
import { getUserLikedPosts, getUserComments, getUserPosts, getUserReposts, formatTimeAgo } from '../services/feed';
import { followUser, unfollowUser, isFollowing, getFollowersCount, getFollowingCount, subscribeToFollowStatus } from '../services/followService';
import type { UserProfile } from '../types';
import type { FeedPost, FeedReply } from '../services/feed';
import FeedCard from './FeedCard';
import { useCustomModal } from '../hooks/useCustomModal';
import CustomModal from './CustomModal';
import InfiniteScrollSentinel from './InfiniteScrollSentinel';

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
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);

    // Posts tab state with infinite scroll
    const [allPosts, setAllPosts] = useState<FeedPost[]>([]);
    const [displayedPosts, setDisplayedPosts] = useState<FeedPost[]>([]);
    const [isLoadingPosts, setIsLoadingPosts] = useState(false);
    const [hasMorePosts, setHasMorePosts] = useState(false);
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

    // Load user activity (likes, comments) - ultra fast with minimal data
    useEffect(() => {
        const fetchUserActivity = async () => {
            if (!user?.uid) return;

            setIsLoadingActivity(true);
            try {
                // Fetch more posts to catch likes (50 posts checked, returns all liked ones)
                const [liked, comments] = await Promise.all([
                    getUserLikedPosts(user.uid, 50),
                    getUserComments(user.uid, 50),
                ]);

                setLikedPosts(liked);
                setUserComments(comments);
            } catch (error) {
                console.error('Error fetching activity:', error);
            } finally {
                setIsLoadingActivity(false);
            }
        };

        if (activeTab === 'activity') {
            fetchUserActivity();
        }
    }, [user?.uid, activeTab]);

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

    return (
        <div className="min-h-screen bg-[#f8f9fa]">
            <div className="max-w-[1600px] mx-auto px-4 md:px-0">
                {/* Profile Header */}
                <div className="relative bg-white border-b border-gray-200">
                    {/* Cover Photo - Minimal Black & White */}
                    <div className="h-32 md:h-52 bg-gradient-to-br from-gray-900 via-gray-800 to-black relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20"></div>
                        {/* Subtle pattern overlay */}
                        <div className="absolute inset-0 opacity-5" style={{
                            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                            backgroundSize: '40px 40px'
                        }}></div>
                    </div>

                    {/* Profile Info */}
                    <div className="relative px-4 md:px-8 pb-4 md:pb-6">
                        {/* Avatar */}
                        <div className="absolute -top-12 md:-top-20 left-4 md:left-8">
                        {(() => {
                            const profile = isViewingOwnProfile ? userProfile : viewingProfile;
                            // Check if user has a custom avatar (base64 or URL, but not blob)
                            const hasCustomAvatar = profile?.avatar &&
                                profile.avatar.trim() !== '' &&
                                !profile.avatar.startsWith('blob:');

                            if (hasCustomAvatar) {
                                return (
                                    <img
                                        src={profile.avatar}
                                        alt="Profile Avatar"
                                        className="w-24 h-24 md:w-40 md:h-40 rounded-full border-4 border-white shadow-xl object-cover ring-2 ring-gray-100"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                        }}
                                    />
                                );
                            }

                            // Simple placeholder avatar
                            return (
                                <div className="w-24 h-24 md:w-40 md:h-40 bg-gray-100 rounded-full border-4 border-white flex items-center justify-center shadow-xl ring-2 ring-gray-100">
                                    <svg className="w-12 h-12 md:w-20 md:h-20 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Profile Actions */}
                    <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 mt-16 md:mt-2">
                        {isViewingOwnProfile ? (
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="px-4 md:px-6 py-2.5 bg-white text-gray-900 text-sm md:text-base font-semibold rounded-lg hover:bg-gray-50 transition-colors border-2 border-gray-900 shadow-sm"
                            >
                                Edit Profile
                            </button>
                        ) : (
                            <button
                                onClick={handleFollow}
                                disabled={isLoadingFollow || !user?.uid}
                                className={`px-4 md:px-6 py-2.5 font-semibold text-sm md:text-base rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm ${
                                    isFollowingUser
                                        ? 'bg-white text-gray-900 border-2 border-gray-900 hover:bg-gray-50'
                                        : 'bg-black !text-white hover:bg-gray-800'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isLoadingFollow ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                                ) : isFollowingUser ? (
                                    'Following'
                                ) : (
                                    'Follow'
                                )}
                            </button>
                        )}
                    </div>

                    {/* Profile Details */}
                    <div className="mt-16 md:mt-24">
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                            {(isViewingOwnProfile ? userProfile : viewingProfile)?.username || 'Anonymous'}
                        </h1>
                        <div className="text-sm md:text-base text-gray-500 mb-3 md:mb-4 font-medium">
                            {(() => {
                                const profile = isViewingOwnProfile ? userProfile : viewingProfile;
                                const handle = profile?.handle;
                                if (handle && handle.trim()) {
                                    return `@${handle}`;
                                }
                                return '@anonymous';
                            })()}
                        </div>

                        {/* Followers/Following Counts */}
                        <div className="flex gap-4 mb-4 text-sm">
                            <button
                                onClick={() => {
                                    // TODO: Open followers modal/list
                                }}
                                className="hover:underline cursor-pointer"
                            >
                                <span className="font-bold text-gray-900">{followersCount}</span>
                                <span className="text-gray-500 ml-1">Followers</span>
                            </button>
                            <button
                                onClick={() => {
                                    // TODO: Open following modal/list
                                }}
                                className="hover:underline cursor-pointer"
                            >
                                <span className="font-bold text-gray-900">{followingCount}</span>
                                <span className="text-gray-500 ml-1">Following</span>
                            </button>
                        </div>

                        {/* Bio */}
                        <div className="text-sm md:text-base text-gray-700 mb-4 leading-relaxed">
                            {(isViewingOwnProfile ? userProfile : viewingProfile)?.bio || 'No bio yet.'}
                        </div>

                        {/* X Handle */}
                        {(isViewingOwnProfile ? userProfile : viewingProfile)?.xHandle && (
                            <div className="flex items-center gap-2 mb-4">
                                <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                <a
                                    href={`https://x.com/${(isViewingOwnProfile ? userProfile : viewingProfile)?.xHandle}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-900 hover:text-black transition-colors font-medium"
                                >
                                    @{(isViewingOwnProfile ? userProfile : viewingProfile)?.xHandle}
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white border-b border-gray-200 sticky top-0 md:top-0 z-10">
                <nav className="flex max-w-[1600px] mx-auto overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('posts')}
                        className={`flex-1 min-w-[100px] py-3 md:py-4 px-3 md:px-6 text-center text-xs md:text-base font-semibold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'posts'
                                ? 'text-black border-black'
                                : 'text-gray-500 border-transparent hover:text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                        Posts
                    </button>
                    <button
                        onClick={() => setActiveTab('activity')}
                        className={`flex-1 min-w-[100px] py-3 md:py-4 px-3 md:px-6 text-center text-xs md:text-base font-semibold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'activity'
                                ? 'text-black border-black'
                                : 'text-gray-500 border-transparent hover:text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                        Activity
                    </button>
                </nav>
            </div>

            {/* Content Area */}
            <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 md:py-8">
                {/* Posts Tab */}
                {activeTab === 'posts' && (
                    <div className="space-y-6">

                        {isLoadingPosts ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                <p className="text-gray-600">Loading your posts...</p>
                            </div>
                        ) : displayedPosts.length > 0 ? (
                            <div className="bg-white">
                                {displayedPosts.map((post, index) => (
                                    <div
                                        key={post.id}
                                        className={index > 0 ? "border-t border-gray-200" : ""}
                                    >
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
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Posts Yet</h3>
                                <p className="text-gray-600">Your posts will appear here when you create them</p>
                            </div>
                        )}
                    </div>
                )}


                {/* Activity Tab */}
                {activeTab === 'activity' && (
                    <div className="space-y-6">
                        {isLoadingActivity ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                <p className="text-gray-600">Loading your activity...</p>
                            </div>
                        ) : (
                            <>
                                {/* Liked Posts Section */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                        </svg>
                                        Liked Posts ({likedPosts.length})
                                    </h3>
                                    <div className="space-y-4">
                                        {likedPosts.length > 0 ? (
                                            likedPosts.map(post => {
                                                return <FeedCard key={post.id} post={post} />;
                                            })
                                        ) : (
                                            <div className="text-center py-8 bg-white rounded-xl border border-gray-200 shadow-sm">
                                                <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                </svg>
                                                <p className="text-gray-600">No liked posts yet</p>
                                                <p className="text-sm text-gray-500 mt-1">Posts you like will appear here</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Comments Section */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                        Your Comments ({userComments.length})
                                    </h3>
                                    <div className="space-y-4">
                                        {userComments.length > 0 ? (
                                            userComments.map(comment => (
                                                <div key={comment.id} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                                                            <span className="text-white font-semibold text-sm">
                                                                {comment.displayName.charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="text-gray-900 font-semibold">{comment.displayName}</span>
                                                                <span className="text-gray-600 text-sm">{comment.handle}</span>
                                                                <span className="text-gray-400 text-sm">•</span>
                                                                <span className="text-gray-600 text-sm">{formatTimeAgo(comment.createdAt)}</span>
                                                            </div>
                                                            <p className="text-gray-900 mb-3 whitespace-pre-wrap">{comment.text}</p>
                                                            <div className="text-sm text-gray-600">
                                                                <span>Replying to Post </span>
                                                                <a href={`/post/${comment.postId}`} className="text-blue-600 hover:underline">
                                                                    #{comment.postId.slice(0, 8)}
                                                                </a>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 bg-white rounded-xl border border-gray-200 shadow-sm">
                                                <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                </svg>
                                                <p className="text-gray-600">No comments yet</p>
                                                <p className="text-sm text-gray-500 mt-1">Your comments will appear here</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
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
                            {/* Display Name */}
                                <div>
                                <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-3">Display Name</label>
                                    <input
                                        type="text"
                                        id="username"
                                        name="username"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                    className="w-full px-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                                    placeholder="Enter display name"
                                />
                            </div>

                            {/* Username Handle */}
                            <div>
                                <label htmlFor="handle" className="block text-sm font-semibold text-gray-700 mb-3">Username</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-gray-500">@</span>
                                    <input
                                        type="text"
                                        id="handle"
                                        name="handle"
                                        value={formData.handle || ''}
                                        onChange={handleInputChange}
                                        className="w-full pl-8 pr-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                                        placeholder="johndoe"
                                        pattern="[a-zA-Z0-9_]+"
                                        title="Only letters, numbers, and underscores allowed"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2">This will be your unique @username. Letters, numbers, and underscores only.</p>
                            </div>

                            {/* Bio */}
                            <div>
                                <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-3">Bio</label>
                                <textarea
                                    id="bio"
                                    name="bio"
                                    value={formData.bio || ''}
                                    onChange={handleInputChange}
                                    rows={4}
                                    maxLength={280}
                                    className="w-full px-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 resize-none"
                                    placeholder="Tell us about yourself..."
                                />
                                <div className="text-xs text-gray-600 mt-2">
                                    {(formData.bio || '').length}/280 characters
                                </div>
                            </div>

                            {/* X Handle */}
                            <div>
                                <label htmlFor="xHandle" className="block text-sm font-semibold text-gray-700 mb-3">X Handle</label>
                                <input
                                    type="text"
                                    id="xHandle"
                                    name="xHandle"
                                    value={formData.xHandle || ''}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                                    placeholder="@username"
                                    pattern="^@?[A-Za-z0-9_]{1,15}$"
                                />
                                <div className="text-xs text-gray-600 mt-2">
                                    Enter without @ symbol
                        </div>
                    </div>

                            {/* Avatar Upload */}
                            <div>
                                <label htmlFor="avatar" className="block text-sm font-semibold text-gray-700 mb-3">Profile Picture</label>
                            <input
                                type="file"
                                id="avatar"
                                name="avatar"
                                accept="image/*"
                                onChange={handleImageUpload}
                                    className="w-full px-4 py-3 border bg-white border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-black file:!text-white hover:file:bg-gray-800"
                            />
                        </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-4 md:pt-6">
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
            </div>

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
