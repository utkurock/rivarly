import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Market, Post, UserProfile } from '../types';

interface FirebaseContextType {
  user: User | null;
  userProfile: UserProfile | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  createMarket: (marketData: Omit<Market, 'id' | 'creator'>) => Promise<string>;
  updateMarket: (marketId: string, updates: Partial<Market>) => Promise<void>;
  createPost: (postData: Omit<Post, 'id' | 'user' | 'timestamp'>) => Promise<string>;
  subscribeToMarkets: (callback: (markets: Market[]) => void) => () => void;
  subscribeToPosts: (callback: (posts: Post[]) => void) => () => void;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

interface FirebaseProviderProps {
  children: React.ReactNode;
}

export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        // Try to load from localStorage first (fast)
        const cachedProfile = localStorage.getItem('userProfile');
        if (cachedProfile) {
          try {
            const parsed = JSON.parse(cachedProfile);
            if (parsed && parsed.username) {
              setUserProfile(parsed);
            }
          } catch (e) {
            // Silently handle parse errors
          }
        }
        
        // Load fresh data from Firestore (background)
        const userDoc = await getDoc(doc(db, 'users', authUser.uid));
        if (userDoc.exists()) {
          const rawData = userDoc.data();
          
          // Keep localStorage avatar if it exists (preserve user's custom avatar)
          const localStorageProfile = cachedProfile ? JSON.parse(cachedProfile) : null;
          const preservedAvatar = localStorageProfile?.avatar || rawData.avatar || rawData.avatarUrl || '';
          const preservedUsername = localStorageProfile?.username || rawData.username || rawData.displayName || 'Anonymous';
          
          // Normalize the profile data
          const firestoreProfile: UserProfile = {
            uid: rawData.uid || authUser.uid,
            username: preservedUsername, // Preserve localStorage username
            displayName: preservedUsername, // Sync displayName too
            handle: localStorageProfile?.handle || rawData.handle || '', // Preserve handle
            avatar: preservedAvatar, // Keep localStorage avatar
            avatarUrl: preservedAvatar, // Sync avatarUrl too
            bio: localStorageProfile?.bio || rawData.bio || '',
            xHandle: localStorageProfile?.xHandle || rawData.xHandle || '',
          };
          
          setUserProfile(firestoreProfile);
          
          // Sync with localStorage
          localStorage.setItem('userProfile', JSON.stringify(firestoreProfile));
          window.dispatchEvent(new Event('userProfileUpdated'));
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto-signin anonymously for development
  useEffect(() => {
    const autoSignIn = async () => {
      try {
        const result = await signInAnonymously(auth);
        
        // Check if user profile already exists
        const userDocRef = doc(db, 'users', result.user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          // Only create profile if it doesn't exist
          const newProfile: UserProfile = {
            uid: result.user.uid,
            username: 'Anonymous',
            displayName: 'Anonymous',
            avatar: '',
            avatarUrl: '',
            bio: '',
            xHandle: '',
          };
          
          try {
            await setDoc(userDocRef, newProfile);
          } catch (profileError) {
            console.error('❌ Error creating user profile:', profileError);
          }
        }
        
        
      } catch (error: any) {
        // Silently handle all Firebase errors
        // App will work without Firebase authentication
      }
    };

    // Always try to sign in anonymously
    autoSignIn();
  }, []); // Remove user dependency to always try

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const createMarket = async (marketData: Omit<Market, 'id' | 'creator'>): Promise<string> => {
    // Allow market creation even without Firebase authentication
    // Use the authenticated user's uid as creator, otherwise anonymous
    const creator = userProfile?.uid || user?.uid || 'anonymous';

    // Get creator profile information
    const creatorProfile = userProfile ? {
      username: userProfile.username || 'Anonymous',
      avatar: userProfile.avatar || '',
    } : {
      username: 'Anonymous',
      avatar: '',
    };

    // Map legacy fields to new structure
    const marketPayload: any = {
      title: marketData.title || marketData.question || 'Untitled Market',
      category: marketData.category,
      probability: marketData.probability || 0.5,
      resolvesAt: marketData.resolvesAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
      status: marketData.status || 'open',
      // Legacy fields for backward compatibility
      question: marketData.question,
      creator: creator,
      creatorProfile: creatorProfile, // Add creator profile info
      yesPrice: marketData.yesPrice || 0.5,
      noPrice: marketData.noPrice || 0.5,
      imageUrl: marketData.imageUrl || 'https://images.unsplash.com/photo-1612180339915-5a4a905e3a5b?q=80&w=2940&auto=format&fit=crop',
      trending: marketData.trending || false,
      yesBets: marketData.yesBets || 0,
      noBets: marketData.noBets || 0,
      createdAt: new Date(),
    };
    
    // Persist description and sources if provided
    if ((marketData as any).info) {
      marketPayload.info = (marketData as any).info;
    }
    if ((marketData as any).sources) {
      marketPayload.sources = (marketData as any).sources;
    }
    // Persist metrics and pools if provided by caller (App.tsx)
    if ((marketData as any).metrics) {
      marketPayload.metrics = (marketData as any).metrics;
    } else {
      // Initialize metrics with zero volume for new markets
      marketPayload.metrics = {
        totalVolumeUSD: 0,
        volume24hUSD: 0,
        feesUSD: 0,
        feesPct: 1,
      };
    }
    
    // Initialize volumeUSD if not set
    if (!marketPayload.volumeUSD) {
      marketPayload.volumeUSD = 0;
    }

    // Keep optional legacy sourceUrl if present
    if ((marketData as any).sourceUrl) {
      marketPayload.sourceUrl = (marketData as any).sourceUrl;
    }
    
    const marketRef = await addDoc(collection(db, 'markets'), marketPayload);
    
    return marketRef.id;
  };

  const updateMarket = async (marketId: string, updates: Partial<Market>): Promise<void> => {
    const marketRef = doc(db, 'markets', marketId);
    await updateDoc(marketRef, {
      ...updates,
      updatedAt: new Date(),
    });
  };

  const createPost = async (postData: Omit<Post, 'id' | 'user' | 'timestamp'>): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');
    
    // Use userProfile from context
    let displayName = 'Anonymous';
    let avatarUrl = '';
    let handle = '';

    if (userProfile) {
      displayName = userProfile.username || userProfile.displayName || 'Anonymous';
      avatarUrl = userProfile.avatar || userProfile.avatarUrl || '';

      if (userProfile.handle && userProfile.handle.trim()) {
        handle = userProfile.handle;
      }
    } else {
      // Fallback: load profile from the users collection by Firebase UID
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        displayName = userData.username || userData.displayName || userData.name || 'Anonymous';
        avatarUrl = userData.avatar || userData.avatarUrl || '';

        if (userData.handle && userData.handle.trim()) {
          handle = userData.handle;
        }
      }
    }
    
    // Convert images array to MediaItem format
    const mediaItems = (postData.images || []).map((url: string) => ({
      url,
      type: 'image' as const,
    }));
    
    // Create post document (only include media if it exists)
    const postDocument: any = {
      uid: user.uid,
      displayName,
      handle,
      avatarUrl,
      text: postData.content || '',
      marketId: (postData as any).marketId || null, // Support marketId from postData
      createdAt: serverTimestamp(),
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
    };
    
    // Only add media field if there are images (Firebase doesn't accept undefined)
    if (mediaItems.length > 0) {
      postDocument.media = mediaItems;
    }
    
    // Create post in 'feed' collection
    const postRef = await addDoc(collection(db, 'feed'), postDocument);
    
    return postRef.id;
  };

  const subscribeToMarkets = (callback: (markets: Market[]) => void) => {
    const q = query(collection(db, 'markets'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const markets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Market[];
      callback(markets);
    });
  };

  const subscribeToPosts = (callback: (posts: Post[]) => void) => {
    // Subscribe to 'feed' collection instead of 'posts'
    const q = query(collection(db, 'feed'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const posts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Map feed structure to Post structure for backwards compatibility
          content: data.text || '',
          timestamp: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          user: {
            uid: data.uid || '',
            username: data.displayName || 'Anonymous',
            avatar: data.avatarUrl || '',
          },
        } as Post;
      });
      callback(posts);
    });
  };

  const value: FirebaseContextType = {
    user,
    userProfile,
    signInWithGoogle,
    logout,
    createMarket,
    updateMarket,
    createPost,
    subscribeToMarkets,
    subscribeToPosts,
  };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
};
