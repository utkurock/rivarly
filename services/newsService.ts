import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { NewsItem } from '../types';

// Create a new news item
export const createNewsItem = async (
  newsData: Omit<NewsItem, 'id' | 'createdAt' | 'createdBy'>,
  creatorId: string
): Promise<string> => {
  try {
    const newsRef = collection(db, 'news');
    const docRef = await addDoc(newsRef, {
      ...newsData,
      createdAt: new Date().toISOString(),
      createdBy: creatorId, // Admin user id
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Error creating news item:', error);
    throw error;
  }
};

// Update a news item
export const updateNewsItem = async (
  newsId: string,
  updates: Partial<Omit<NewsItem, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> => {
  try {
    const newsRef = doc(db, 'news', newsId);
    await updateDoc(newsRef, updates);
  } catch (error) {
    console.error('Error updating news item:', error);
    throw error;
  }
};

// Delete a news item
export const deleteNewsItem = async (newsId: string): Promise<void> => {
  try {
    const newsRef = doc(db, 'news', newsId);
    await deleteDoc(newsRef);
  } catch (error) {
    console.error('Error deleting news item:', error);
    throw error;
  }
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

