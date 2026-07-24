import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../firebase';

const COMMENTS_COLLECTION = 'comments';

export const addComment = async (
  marketId: string,
  userId: string,
  content: string,
  userProfile?: { username: string; avatar?: string }
): Promise<string> => {
  try {
    const commentData = {
      marketId,
      userAddress: userId, // Legacy field name; stores the Firebase uid
      content: content.trim(),
      timestamp: serverTimestamp(),
      createdAt: new Date(),
      // Add user profile info if provided
      ...(userProfile && {
        userProfile: {
          username: userProfile.username || 'Anonymous',
          avatar: userProfile.avatar || '',
        }
      }),
    };

    const docRef = await addDoc(collection(db, COMMENTS_COLLECTION), commentData);
    return docRef.id;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw new Error('Failed to add comment');
  }
};

export const getPricePoints = async (marketId: string, limitCount = 200) => {
  try {
    const q = query(
      collection(db, 'prices'),
      where('marketId', '==', marketId),
      orderBy('timestamp', 'asc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to fetch price points');
    return [];
  }
};
