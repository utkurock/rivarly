import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
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

const safeParse = (raw: string | null): any => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

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
    let cancelled = false;
    let signingIn = false;

    // Reuse the persisted anonymous session across reloads so a returning
    // visitor keeps the same uid — one Auth entry per browser — instead of
    // minting a fresh anonymous user on every load.
    const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);

      // No session yet (first visit or after sign-out): restore or create the
      // single anonymous identity. Guarded so a transient double-fire — or the
      // re-fire triggered by our own sign-in — can't create a second user.
      if (!authUser) {
        setUserProfile(null);
        await persistenceReady;
        if (cancelled || signingIn || auth.currentUser) return;
        signingIn = true;
        try {
          await signInAnonymously(auth); // re-fires this listener with the new user
        } catch {
          // Anonymous auth disabled / offline — the app runs logged-out.
        } finally {
          signingIn = false;
        }
        return;
      }

      // Fast paint from cache while Firestore loads.
      const cachedProfile = localStorage.getItem('userProfile');
      const cached = safeParse(cachedProfile);
      if (cached?.username) setUserProfile(cached);

      // Load the profile for this uid, or create it the first time the uid is
      // seen. Keyed by uid, so renames never spawn a new record.
      const userRef = doc(db, 'users', authUser.uid);
      let snap;
      try {
        snap = await getDoc(userRef);
      } catch {
        return; // offline / rules — keep the cached profile
      }
      if (cancelled) return;

      if (snap.exists()) {
        const rawData = snap.data();
        // Keep the user's local edits (name/avatar) over server values.
        const preservedAvatar = cached?.avatar || rawData.avatar || rawData.avatarUrl || '';
        const preservedUsername = cached?.username || rawData.username || rawData.displayName || 'Anonymous';
        const firestoreProfile: UserProfile = {
          uid: rawData.uid || authUser.uid,
          username: preservedUsername,
          displayName: preservedUsername,
          handle: cached?.handle || rawData.handle || '',
          avatar: preservedAvatar,
          avatarUrl: preservedAvatar,
          bio: cached?.bio || rawData.bio || '',
          xHandle: cached?.xHandle || rawData.xHandle || '',
        };
        setUserProfile(firestoreProfile);
        localStorage.setItem('userProfile', JSON.stringify(firestoreProfile));
        window.dispatchEvent(new Event('userProfileUpdated'));
      } else {
        const newProfile: UserProfile = {
          uid: authUser.uid,
          username: 'Anonymous',
          displayName: 'Anonymous',
          avatar: '',
          avatarUrl: '',
          bio: '',
          xHandle: '',
        };
        try {
          await setDoc(userRef, newProfile);
        } catch {
          // ignore — profile will be created on the next authenticated write
        }
        if (!cancelled) setUserProfile(newProfile);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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
