import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  increment,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Follow a user
 */
export const followUser = async (followerId: string, followingId: string): Promise<void> => {
  try {
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }

    // Check if already following
    const followRef = doc(db, 'follows', `${followerId}_${followingId}`);
    const followDoc = await getDoc(followRef);
    
    if (followDoc.exists()) {
      return; // Already following
    }

    // Create follow relationship
    await setDoc(followRef, {
      followerId,
      followingId,
      createdAt: new Date()
    });

    // Update follower's following count
    const followerRef = doc(db, 'users', followerId);
    await updateDoc(followerRef, {
      followingCount: increment(1)
    }).catch(() => {
      // User might not exist yet, create it
      setDoc(followerRef, {
        followingCount: 1,
        followersCount: 0
      }, { merge: true });
    });

    // Update following user's followers count
    const followingRef = doc(db, 'users', followingId);
    await updateDoc(followingRef, {
      followersCount: increment(1)
    }).catch(() => {
      // User might not exist yet, create it
      setDoc(followingRef, {
        followingCount: 0,
        followersCount: 1
      }, { merge: true });
    });
  } catch (error) {
    console.error('Error following user:', error);
    throw error;
  }
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (followerId: string, followingId: string): Promise<void> => {
  try {
    const followRef = doc(db, 'follows', `${followerId}_${followingId}`);
    const followDoc = await getDoc(followRef);
    
    if (!followDoc.exists()) {
      return; // Not following
    }

    // Delete follow relationship
    await deleteDoc(followRef);

    // Update follower's following count
    const followerRef = doc(db, 'users', followerId);
    await updateDoc(followerRef, {
      followingCount: increment(-1)
    }).catch(() => {
      // Ignore if user doesn't exist
    });

    // Update following user's followers count
    const followingRef = doc(db, 'users', followingId);
    await updateDoc(followingRef, {
      followersCount: increment(-1)
    }).catch(() => {
      // Ignore if user doesn't exist
    });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    throw error;
  }
};

/**
 * Check if a user is following another user
 */
export const isFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  try {
    const followRef = doc(db, 'follows', `${followerId}_${followingId}`);
    const followDoc = await getDoc(followRef);
    return followDoc.exists();
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
};

/**
 * Get followers count for a user
 */
export const getFollowersCount = async (userId: string): Promise<number> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data().followersCount || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting followers count:', error);
    return 0;
  }
};

/**
 * Get following count for a user
 */
export const getFollowingCount = async (userId: string): Promise<number> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data().followingCount || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting following count:', error);
    return 0;
  }
};

/**
 * Get list of users that a user is following
 */
export const getFollowingList = async (userId: string): Promise<string[]> => {
  try {
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().followingId);
  } catch (error) {
    console.error('Error getting following list:', error);
    return [];
  }
};

/**
 * Get list of users following a user
 */
export const getFollowersList = async (userId: string): Promise<string[]> => {
  try {
    const q = query(
      collection(db, 'follows'),
      where('followingId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().followerId);
  } catch (error) {
    console.error('Error getting followers list:', error);
    return [];
  }
};

/**
 * Subscribe to follow status changes
 */
export const subscribeToFollowStatus = (
  followerId: string,
  followingId: string,
  callback: (isFollowing: boolean) => void
): (() => void) => {
  const followRef = doc(db, 'follows', `${followerId}_${followingId}`);
  
  const unsubscribe = onSnapshot(followRef, (doc) => {
    callback(doc.exists());
  });

  return unsubscribe;
};

/**
 * Subscribe to user's following list
 */
export const subscribeToFollowingList = (
  userId: string,
  callback: (followingIds: string[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'follows'),
    where('followerId', '==', userId)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const followingIds = snapshot.docs.map(doc => doc.data().followingId);
    callback(followingIds);
  });

  return unsubscribe;
};
