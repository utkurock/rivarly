import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface LeaderboardEntry {
  uid: string;
  username: string;
  handle: string;
  avatar: string;
  points: number;
}

const LIMIT = 100;

/** All-time ranking: users by cumulative points, highest first. */
export const getAllTimeLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('points', 'desc'), limit(LIMIT)));
    return snap.docs.map((d) => {
      const data: any = d.data();
      return {
        uid: d.id,
        username: data.username || data.displayName || 'Anonymous',
        handle: data.handle || '',
        avatar: data.avatar || data.avatarUrl || '',
        points: data.points || 0,
      };
    });
  } catch (e) {
    console.error('Error loading all-time leaderboard:', e);
    return [];
  }
};

/** Today's ranking: points earned today (UTC), highest first. */
export const getDailyLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    // No orderBy here (avoids a composite index); today's set is small — sort client-side.
    const snap = await getDocs(query(collection(db, 'dailyPoints'), where('date', '==', today)));
    const entries: LeaderboardEntry[] = snap.docs.map((d) => {
      const data: any = d.data();
      return {
        uid: data.uid || d.id,
        username: data.username || 'Anonymous',
        handle: data.handle || '',
        avatar: data.avatar || '',
        points: data.points || 0,
      };
    });
    entries.sort((a, b) => b.points - a.points);
    return entries.slice(0, LIMIT);
  } catch (e) {
    console.error('Error loading daily leaderboard:', e);
    return [];
  }
};
