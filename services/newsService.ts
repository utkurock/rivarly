import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { NewsItem } from '../types';

// News mutations go through the trusted admin endpoint (server-only password +
// Admin SDK), since the `news` collection is not client-writable.
const ADMIN_PW_KEY = 'rivarly_admin_pw';
export const getStoredAdminPassword = () => sessionStorage.getItem(ADMIN_PW_KEY) || '';
export const setStoredAdminPassword = (pw: string) => sessionStorage.setItem(ADMIN_PW_KEY, pw);
export const clearStoredAdminPassword = () => sessionStorage.removeItem(ADMIN_PW_KEY);

const adminNews = async (payload: Record<string, unknown>): Promise<any> => {
  const res = await fetch('/api/admin-news', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: getStoredAdminPassword(), ...payload }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Request failed.');
  return out;
};

/** Validate an admin password against the server (used by the login gate). */
export const verifyAdminPassword = async (password: string): Promise<boolean> => {
  try {
    const res = await fetch('/api/admin-news', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, action: 'ping' }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// Create a new news item (server-side).
export const createNewsItem = async (
  newsData: Omit<NewsItem, 'id' | 'createdAt' | 'createdBy'>,
  _creatorId?: string
): Promise<string> => {
  const out = await adminNews({ action: 'create', item: newsData });
  return out.id;
};

// Update a news item (server-side).
export const updateNewsItem = async (
  newsId: string,
  updates: Partial<Omit<NewsItem, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> => {
  await adminNews({ action: 'update', id: newsId, item: updates });
};

// Delete a news item (server-side).
export const deleteNewsItem = async (newsId: string): Promise<void> => {
  await adminNews({ action: 'delete', id: newsId });
};

// Get all news items, sorted by publishedAt (newest first)
export const getAllNews = async (): Promise<NewsItem[]> => {
  try {
    const newsRef = collection(db, 'news');
    const q = query(newsRef, orderBy('publishedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const news: NewsItem[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      news.push({
        id: doc.id,
        ...data,
      } as NewsItem);
    });
    
    return news;
  } catch (error) {
    console.error('❌ newsService: Error fetching all news:', error);
    throw error;
  }
};

// Get news items by category
export const getNewsByCategory = async (category: string): Promise<NewsItem[]> => {
  try {
    const newsRef = collection(db, 'news');
    // Only use where() - no orderBy to avoid composite index requirement
    const q = query(
      newsRef,
      where('category', '==', category)
    );
    const querySnapshot = await getDocs(q);
    
    const news: NewsItem[]  = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      news.push({
        id: doc.id,
        ...data,
      } as NewsItem);
    });
    
    // Sort client-side by publishedAt (newest first)
    news.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateB - dateA;
    });
    
    return news;
  } catch (error) {
    console.error('❌ newsService: Error fetching news by category:', category, error);
    throw error;
  }
};

// Get recent news (last N items)
export const getRecentNews = async (limit: number = 10): Promise<NewsItem[]> => {
  try {
    const newsRef = collection(db, 'news');
    const q = query(newsRef, orderBy('publishedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const news: NewsItem[] = [];
    let count = 0;
    querySnapshot.forEach((doc) => {
      if (count < limit) {
        news.push({
          id: doc.id,
          ...doc.data(),
        } as NewsItem);
        count++;
      }
    });
    
    return news;
  } catch (error) {
    console.error('Error fetching recent news:', error);
    throw error;
  }
};

