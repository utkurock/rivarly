import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL,
  deleteObject 
} from 'firebase/storage';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDoc,
  getDocs, 
  query, 
  orderBy, 
  limit, 
  startAfter,
  onSnapshot,
  serverTimestamp,
  increment,
  where,
  arrayUnion,
  arrayRemove,
  startAt,
  endAt
} from 'firebase/firestore';
import { storage, db } from '../firebase';
import type { Timestamp } from 'firebase/firestore';

// Types
export interface MediaItem {
  url: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
}

export interface FeedPost {
  id: string;
  uid: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  text: string;
  media?: MediaItem[];
  marketId?: string;
  createdAt: Timestamp;
  // When this post is shown as a repost, this is the time user reposted it
  repostAt?: Timestamp;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  pending?: boolean; // For optimistic updates
  likedBy?: string[]; // Array of user IDs who liked this post
  repostedBy?: string[]; // Array of user IDs who reposted
  reposterProfile?: { // Profile info for the user who RT'd this
    displayName: string;
    handle: string;
    avatarUrl?: string;
  };
}

export interface FeedReply {
  id: string;
  uid: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  text: string;
  media?: MediaItem[];
  createdAt: Timestamp;
  pending?: boolean;
}

// Utility functions
export const formatTimeAgo = (timestamp: Timestamp | null | undefined): string => {
  if (!timestamp) return 'just now';
  
  try {
    const now = new Date();
    const postTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as any);
    const diffInSeconds = Math.floor((now.getTime() - postTime.getTime()) / 1000);
    
    if (diffInSeconds < 0) return 'just now';
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d`;
    return `${Math.floor(diffInSeconds / 2592000)}mo`;
  } catch (error) {
    console.error('Error formatting time:', error);
    return 'just now';
  }
};

export const validateFile = (file: File): { valid: boolean; error?: string } => {
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Only images and MP4 videos are allowed.' };
  }
  
  // Check file size (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size too large. Maximum size is 10MB.' };
  }
  
  return { valid: true };
};

export const compressImage = (file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file); // Return original file for non-images
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        file.type,
        quality
      );
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

// Media upload function (Base64 - no CORS issues)
export const uploadMediaAsBase64 = async (
  file: File
): Promise<MediaItem> => {
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Compress and convert to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 800; // Max width/height for posts
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
          
          // Convert to base64 with 0.8 quality
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          

          
          resolve({
            url: base64,
            type: 'image',
            width,
            height
          });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = event.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    throw new Error('Failed to upload media');
  }
};

// Original Firebase Storage upload (kept for future use)
export const uploadMedia = async (
  file: File, 
  userId: string, 
  folder: 'posts' | 'comments' | 'avatars' = 'posts'
): Promise<MediaItem> => {
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Compress image if needed
    const processedFile = await compressImage(file);
    
    // Create storage reference
    const timestamp = Date.now();
    const fileName = `${timestamp}-${processedFile.name}`;
    const storageRef = ref(storage, `${folder}/${userId}/${fileName}`);
    
    // Upload file with metadata
    const metadata = {
      contentType: processedFile.type,
      customMetadata: {
        originalName: processedFile.name,
        uploadedAt: timestamp.toString(),
      }
    };
    
    const uploadTask = uploadBytesResumable(storageRef, processedFile, metadata);
    
    // Wait for upload to complete
    await new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          // Progress tracking could be added here
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          
        },
        (error) => {
          console.error('Upload error:', error);
          reject(error);
        },
        () => {
          resolve(uploadTask.snapshot);
        }
      );
    });
    
    // Get download URL
    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
    
    // Determine media type
    const mediaType = processedFile.type.startsWith('video/') ? 'video' : 'image';
    
    return {
      url: downloadURL,
      type: mediaType,
      // Note: width/height could be extracted from image metadata if needed
    };
  } catch (error) {
    console.error('Error uploading media:', error);
    throw new Error('Failed to upload media');
  }
};

// Create a new post
export const createPost = async ({
  uid,
  displayName,
  handle,
  avatarUrl,
  text,
  files = [],
  marketId
}: {
  uid: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  text: string;
  files?: File[];
  marketId?: string;
}): Promise<string> => {
  try {
    // Upload media files as base64 (no CORS issues)
    const media: MediaItem[] = [];
    for (const file of files) {
      const mediaItem = await uploadMediaAsBase64(file);
      media.push(mediaItem);
    }
    
    // Create post document
    const postData = {
      uid,
      displayName,
      handle,
      avatarUrl: avatarUrl || '',
      text,
      media: media.length > 0 ? media : undefined,
      marketId: marketId || null,
      createdAt: serverTimestamp(),
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
    };
    
    const docRef = await addDoc(collection(db, 'feed'), postData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating post:', error);
    throw new Error('Failed to create post');
  }
};

// Toggle like on a post
export const toggleLike = async (postId: string, uid: string): Promise<{ liked: boolean; newCount: number }> => {
  try {
    const postRef = doc(db, 'feed', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const likedBy = postData.likedBy || [];
    const isLiked = likedBy.includes(uid);
    
    if (isLiked) {
      // Unlike: remove uid from array and decrement count
      await updateDoc(postRef, {
        likeCount: increment(-1),
        likedBy: arrayRemove(uid)
      });
      
      return { liked: false, newCount: postData.likeCount - 1 };
    } else {
      // Like: add uid to array and increment count
      await updateDoc(postRef, {
        likeCount: increment(1),
        likedBy: arrayUnion(uid)
      });
      
      return { liked: true, newCount: postData.likeCount + 1 };
    }
  } catch (error) {
    console.error('❌ Error toggling like:', error);
    throw new Error('Failed to toggle like');
  }
};

// Repost a post
export const repost = async (
  postId: string, 
  uid: string, 
  profileInfo?: { displayName: string; handle: string; avatarUrl?: string }
): Promise<{ reposted: boolean; newCount: number }> => {
  try {
    const repostRef = doc(db, 'feed', postId, 'reposts', uid);
    const postRef = doc(db, 'feed', postId);
    
    // Get current post data
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postSnap.data();
    const repostedBy = postData.repostedBy || [];
    
    // Check if already reposted
    const repostDocSnap = await getDoc(repostRef);
    const isReposted = repostDocSnap.exists() || repostedBy.includes(uid);
    
    if (isReposted) {
      // Unrepost: delete the repost document, remove from array, and decrement count
      await deleteDoc(repostRef);
      await updateDoc(postRef, {
        repostCount: increment(-1),
        repostedBy: arrayRemove(uid)
      });
      
      return { reposted: false, newCount: postData.repostCount - 1 };
    } else {
      // Repost: create the repost document, add to array, and increment count
      await setDoc(repostRef, {
        uid,
        createdAt: serverTimestamp()
      });
      
      const updateData: any = {
        repostCount: increment(1),
        repostedBy: arrayUnion(uid)
      };
      
      // Add reposter profile info if provided
      if (profileInfo && !postData.reposterProfile) {
        updateData.reposterProfile = profileInfo;
      }
      
      await updateDoc(postRef, updateData);
      
      return { reposted: true, newCount: postData.repostCount + 1 };
    }
  } catch (error) {
    console.error('❌ Error reposting:', error);
    throw new Error('Failed to repost');
  }
};

// Reply to a post
export const replyToPost = async ({
  postId,
  uid,
  displayName,
  handle,
  avatarUrl,
  text,
  file
}: {
  postId: string;
  uid: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  text: string;
  file?: File; // Optional file upload
}): Promise<string> => {
  try {
    // Upload media if provided (as base64 - no CORS issues)
    let media: MediaItem | undefined;
    if (file) {
      media = await uploadMediaAsBase64(file);
    }
    
    // Create reply document - only include media if it exists
    const replyData: any = {
      uid,
      displayName,
      handle,
      avatarUrl: avatarUrl || '',
      text,
      createdAt: serverTimestamp(),
    };
    
    // Only add media field if it exists (Firebase doesn't accept undefined)
    if (media) {
      replyData.media = media;
    }
    
    const docRef = await addDoc(collection(db, 'feed', postId, 'replies'), replyData);
    
    // Increment reply count on the post
    const postRef = doc(db, 'feed', postId);
    await updateDoc(postRef, {
      replyCount: increment(1)
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Error replying to post:', error);
    throw new Error('Failed to reply to post');
  }
};

// Subscribe to posts feed
export const subscribeToFeed = (
  callback: (posts: FeedPost[]) => void,
  pageSize: number = 50
) => {
  const q = query(
    collection(db, 'feed'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  
  return onSnapshot(q, (snapshot) => {
    const posts: FeedPost[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({
        id: doc.id,
        uid: data.uid,
        displayName: data.displayName,
        handle: data.handle,
        avatarUrl: data.avatarUrl,
        text: data.text,
        media: data.media || [],
        marketId: data.marketId,
        createdAt: data.createdAt,
        likeCount: data.likeCount || 0,
        replyCount: data.replyCount || 0,
        repostCount: data.repostCount || 0,
        likedBy: data.likedBy || [],
        repostedBy: data.repostedBy || [],
        reposterProfile: data.reposterProfile,
      } as FeedPost);
    });
    
    callback(posts);
  });
};

// Subscribe to replies for a post
export const subscribeToReplies = (
  postId: string,
  callback: (replies: FeedReply[]) => void
) => {
  const q = query(
    collection(db, 'feed', postId, 'replies'),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const replies: FeedReply[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      replies.push({
        id: doc.id,
        uid: data.uid,
        displayName: data.displayName,
        handle: data.handle,
        avatarUrl: data.avatarUrl,
        text: data.text,
        media: data.media || [],
        createdAt: data.createdAt,
      } as FeedReply);
    });
    callback(replies);
  });
};

// Check if user has liked a post
export const checkUserLiked = async (postId: string, uid: string): Promise<boolean> => {
  try {
    const likeRef = doc(db, 'feed', postId, 'likes', uid);
    const likeDocSnap = await getDoc(likeRef);
    return likeDocSnap.exists();
  } catch (error) {
    console.error('Error checking like status:', error);
    return false;
  }
};

// Check if user has reposted a post
export const checkUserReposted = async (postId: string, uid: string): Promise<boolean> => {
  try {
    const repostRef = doc(db, 'feed', postId, 'reposts', uid);
    const repostDocSnap = await getDoc(repostRef);
    return repostDocSnap.exists();
  } catch (error) {
    console.error('Error checking repost status:', error);
    return false;
  }
};

// Get user's liked posts
export const getUserLikedPosts = async (uid: string, limitCount: number = 50): Promise<FeedPost[]> => {
  try {
    const likedPosts: FeedPost[] = [];
    
    // Query last N posts and filter by likedBy array (no composite index needed)
    // Increased limit to catch more liked posts
    const feedQueryRef = query(collection(db, 'feed'), orderBy('createdAt', 'desc'), limit(limitCount));
    const feedSnapshot = await getDocs(feedQueryRef);
    
    feedSnapshot.forEach((postDoc) => {
      const data: any = postDoc.data();
      const likedBy: string[] = data.likedBy || [];
      if (likedBy.includes(uid)) {
        likedPosts.push({
          id: postDoc.id,
          uid: data.uid,
          displayName: data.displayName,
          handle: data.handle,
          avatarUrl: data.avatarUrl,
          text: data.text,
          media: data.media || [],
          marketId: data.marketId,
          createdAt: data.createdAt as Timestamp,
          likeCount: data.likeCount || 0,
          replyCount: data.replyCount || 0,
          repostCount: data.repostCount || 0,
          repostedBy: data.repostedBy || [],
          reposterProfile: data.reposterProfile,
          // Include likedBy array so FeedCard can show like status
          likedBy: likedBy,
        } as FeedPost);
      }
    });
    
    // Sort by date descending (most recent liked first)
    likedPosts.sort((a, b) => {
      const timeA = a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
      return timeB - timeA;
    });
    
    return likedPosts;
  } catch (error) {
    console.error('Error getting user liked posts:', error);
    return [];
  }
};

// Get user's comments/replies
export const getUserComments = async (uid: string, limitCount: number = 6): Promise<Array<FeedReply & { postId: string }>> => {
  try {
    const userComments: Array<FeedReply & { postId: string }> = [];
    
    // Query only last 6 posts for fastest loading
    const feedQuery = query(collection(db, 'feed'), orderBy('createdAt', 'desc'), limit(limitCount));
    const feedSnapshot = await getDocs(feedQuery);
    
    // For each post, get user's replies (no orderBy to avoid composite index)
    for (const postDoc of feedSnapshot.docs) {
      const repliesQuery = query(
        collection(db, 'feed', postDoc.id, 'replies'),
        where('uid', '==', uid)
      );
      
      const repliesSnapshot = await getDocs(repliesQuery);
      
      repliesSnapshot.docs.forEach(replyDoc => {
        userComments.push({
          id: replyDoc.id,
          postId: postDoc.id,
          ...replyDoc.data(),
          createdAt: replyDoc.data().createdAt as Timestamp,
        } as FeedReply & { postId: string });
      });
    }
    
    // Sort all comments by createdAt
    userComments.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    
    return userComments;
  } catch (error) {
    console.error('Error getting user comments:', error);
    return [];
  }
};

// Get user's reposts (use repostedBy array)
export const getUserReposts = async (uid: string): Promise<FeedPost[]> => {
  try {
    // Query posts where uid is in repostedBy array
    const repostsQuery = query(
      collection(db, 'feed'),
      where('repostedBy', 'array-contains', uid)
    );
    
    const querySnapshot = await getDocs(repostsQuery);
    const repostedPosts: FeedPost[] = [];
    
    for (const postDoc of querySnapshot.docs) {
      const data: any = postDoc.data();
      // Read the user's repost doc to get the repost timestamp
      let repostAt: Timestamp | undefined = undefined;
      try {
        const repostDoc = await getDoc(doc(db, 'feed', postDoc.id, 'reposts', uid));
        if (repostDoc.exists()) {
          const rdata: any = repostDoc.data();
          if (rdata?.createdAt) repostAt = rdata.createdAt as Timestamp;
        }
      } catch {}

      repostedPosts.push({
        id: postDoc.id,
        uid: data.uid,
        displayName: data.displayName,
        handle: data.handle,
        avatarUrl: data.avatarUrl,
        text: data.text,
        media: data.media || [],
        marketId: data.marketId,
        createdAt: data.createdAt as Timestamp,
        repostAt,
        likeCount: data.likeCount || 0,
        replyCount: data.replyCount || 0,
        repostCount: data.repostCount || 0,
        likedBy: data.likedBy || [],
        repostedBy: data.repostedBy || [],
        reposterProfile: data.reposterProfile,
      } as FeedPost);
    }
    
    // Sort by date descending
    repostedPosts.sort((a, b) => {
      const aTs = (a.repostAt?.toDate?.() || a.createdAt.toDate?.() || new Date(0)).getTime();
      const bTs = (b.repostAt?.toDate?.() || b.createdAt.toDate?.() || new Date(0)).getTime();
      return bTs - aTs;
    });
    
    return repostedPosts;
  } catch (error) {
    console.error('Error getting user reposts:', error);
    return [];
  }
};

// Delete a post (only by owner)
export const deletePost = async (postId: string, uid: string): Promise<void> => {
  try {
    const postRef = doc(db, 'feed', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postSnap.data();
    if (postData.uid !== uid) {
      throw new Error('Unauthorized: You can only delete your own posts');
    }
    
    // Delete all subcollections (likes, replies)
    const likesQuery = query(collection(db, 'feed', postId, 'likes'));
    const likesSnapshot = await getDocs(likesQuery);
    const deletePromises = likesSnapshot.docs.map(doc => deleteDoc(doc.ref));
    
    const repliesQuery = query(collection(db, 'feed', postId, 'replies'));
    const repliesSnapshot = await getDocs(repliesQuery);
    deletePromises.push(...repliesSnapshot.docs.map(doc => deleteDoc(doc.ref)));
    
    await Promise.all(deletePromises);
    
    // Delete the post itself
    await deleteDoc(postRef);
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
};

// Delete a reply/comment (only by owner)
export const deleteReply = async (postId: string, replyId: string, uid: string): Promise<void> => {
  try {
    const replyRef = doc(db, 'feed', postId, 'replies', replyId);
    const replySnap = await getDoc(replyRef);
    
    if (!replySnap.exists()) {
      throw new Error('Reply not found');
    }
    
    const replyData = replySnap.data();
    if (replyData.uid !== uid) {
      throw new Error('Unauthorized: You can only delete your own comments');
    }
    
    // Delete the reply
    await deleteDoc(replyRef);
    
    // Decrement reply count on the post
    const postRef = doc(db, 'feed', postId);
    await updateDoc(postRef, {
      replyCount: increment(-1)
    });
  } catch (error) {
    console.error('Error deleting reply:', error);
    throw error;
  }
};

// Delete a feed post
export const deleteFeedPost = async (postId: string): Promise<void> => {
  try {
    const postRef = doc(db, 'feed', postId);
    await deleteDoc(postRef);
  } catch (error) {
    console.error('Error deleting feed post:', error);
    throw new Error('Failed to delete post');
  }
};

// Get user's own posts
export const getUserPosts = async (uid: string): Promise<FeedPost[]> => {
  try {
    // Use only where clause to avoid composite index requirement
    const userPostsQuery = query(
      collection(db, 'feed'),
      where('uid', '==', uid)
    );
    
    const querySnapshot = await getDocs(userPostsQuery);
    const userPosts: FeedPost[] = [];
    
    querySnapshot.forEach((doc) => {
      const data: any = doc.data();
      userPosts.push({
        id: doc.id,
        uid: data.uid,
        displayName: data.displayName,
        handle: data.handle,
        avatarUrl: data.avatarUrl,
        text: data.text,
        media: data.media || [],
        marketId: data.marketId,
        createdAt: data.createdAt as Timestamp,
        likeCount: data.likeCount || 0,
        replyCount: data.replyCount || 0,
        repostCount: data.repostCount || 0,
        likedBy: data.likedBy || [],
        repostedBy: data.repostedBy || [],
        reposterProfile: data.reposterProfile,
      } as FeedPost);
    });
    
    // Sort client-side to avoid composite index
    userPosts.sort((a, b) => {
      const timeA = a.createdAt?.toMillis() || 0;
      const timeB = b.createdAt?.toMillis() || 0;
      return timeB - timeA;
    });
    
    return userPosts;
  } catch (error) {
    console.error('Error getting user posts:', error);
    return [];
  }
};

// A market as surfaced on a user's activity tab (the markets they created).
export interface UserMarket {
  id: string;
  title: string;
  category: string;
  probability: number;
  status: string;
  resolvesAt?: string;
  createdAt?: Timestamp;
}

// Get markets created by a user (their "market activity").
// Filtered client-side by creator to avoid needing a composite index.
export const getUserMarkets = async (uid: string): Promise<UserMarket[]> => {
  try {
    const marketsQuery = query(collection(db, 'markets'), where('creator', '==', uid));
    const snapshot = await getDocs(marketsQuery);

    const markets: UserMarket[] = snapshot.docs.map((d) => {
      const data: any = d.data();
      return {
        id: d.id,
        title: data.title || data.question || 'Untitled market',
        category: data.category || 'Other',
        probability: typeof data.probability === 'number' ? data.probability : 0.5,
        status: data.status || 'open',
        resolvesAt: data.resolvesAt,
        createdAt: data.createdAt as Timestamp,
      };
    });

    // Newest first (sort client-side to avoid a composite index).
    markets.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    return markets;
  } catch (error) {
    console.error('Error getting user markets:', error);
    return [];
  }
};

export async function searchUsers(q: string): Promise<Array<{ uid: string; username: string; displayName?: string; handle?: string; avatar?: string }>> {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const resultsMap = new Map<string, { uid: string; username: string; displayName?: string; handle?: string; avatar?: string }>();
  const usersRef = collection(db, 'users');

  const addFromSnap = (snap: any) => {
    snap.forEach((d: any) => {
      const data = d.data() as any;
      const rec = {
        uid: d.id,
        username: data.username || data.displayName || 'Anonymous',
        displayName: data.displayName,
        handle: data.handle,
        avatar: data.avatar || data.avatarUrl,
      };
      const uname = (data.username || data.displayName || '').toLowerCase();
      const handleStr = (data.handle || '').toLowerCase();
      if (uname.includes(term) || handleStr.includes(term)) {
        resultsMap.set(d.id, rec);
      }
    });
  };

  try {
    // Try prefix queries if indexes exist
    const [byUsername, byDisplayName, byHandle] = await Promise.allSettled([
      getDocs(query(usersRef, orderBy('username'), startAt(term), endAt(term + '\uf8ff'), limit(15))),
      getDocs(query(usersRef, orderBy('displayName'), startAt(term), endAt(term + '\uf8ff'), limit(15))),
      getDocs(query(usersRef, orderBy('handle'), startAt(term), endAt(term + '\uf8ff'), limit(15))),
    ]);
    [byUsername, byDisplayName, byHandle].forEach((res) => {
      if (res.status === 'fulfilled') addFromSnap(res.value);
    });
  } catch {
    // ignore and fallback below
  }

  // Fallback: fetch a wider slice and filter client-side
  if (resultsMap.size === 0) {
    try {
      const snap = await getDocs(query(usersRef, orderBy('username'), limit(100)));
      addFromSnap(snap);
    } catch {
      // last resort: empty
    }
  }

  return Array.from(resultsMap.values()).slice(0, 20);
}
