import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  doc, 
  deleteDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import type { MarketComment } from '../types';

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

export const getComments = async (marketId: string, limitCount: number = 50): Promise<MarketComment[]> => {
  try {
    const q = query(
      collection(db, COMMENTS_COLLECTION),
      where('marketId', '==', marketId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const comments: MarketComment[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      comments.push({
        id: doc.id,
        marketId: data.marketId,
        userAddress: data.userAddress,
        content: data.content,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        createdAt: data.createdAt?.toDate?.() || new Date(),
      });
    });

    return comments;
  } catch (error: any) {
    // Soft-fail on index error
    if (error?.code === 'failed-precondition' && error?.message?.includes('index')) {
      const url = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0];
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[Firestore] Composite index required for comments. marketId==, timestamp desc');
        if (url) console.warn('Create index:', url);
      }
      return [];
    }
    // eslint-disable-next-line no-console
    console.warn('Comments query failed, returning empty array');
    return [];
  }
};

// Prices & Bets services
export const addPricePoint = async (
  marketId: string,
  price: number,
  ts: Date = new Date()
) => {
  try {
    await addDoc(collection(db, 'prices'), {
      marketId,
      price,
      timestamp: ts,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to add price point', e);
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

export const addBetEntry = async (
  marketId: string,
  userId: string,
  side: 'YES' | 'NO',
  amount: number,
  yesRatio?: number
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, 'bets'), {
      marketId,
      userAddress: userId, // Legacy field name; stores the Firebase uid
      side,
      amount,
      ...(typeof yesRatio === 'number' && isFinite(yesRatio) ? { yesRatio } : {}),
      createdAt: new Date(),
    });
    return docRef.id;
  } catch (e) {
    throw new Error(`Failed to add bet entry: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const getRecentBets = async (marketId: string, limitCount = 20) => {
  try {
    const q = query(
      collection(db, 'bets'),
      where('marketId', '==', marketId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to fetch bets');
    return [];
  }
};

export const deleteComment = async (commentId: string, userId: string): Promise<void> => {
  try {
    // In a real app, you might want to add security rules to ensure only the comment author can delete
    await deleteDoc(doc(db, COMMENTS_COLLECTION, commentId));
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw new Error('Failed to delete comment');
  }
};

export const getCommentCount = async (marketId: string): Promise<number> => {
  try {
    const q = query(
      collection(db, COMMENTS_COLLECTION),
      where('marketId', '==', marketId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error getting comment count:', error);
    return 0;
  }
};
