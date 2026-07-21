import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../types';

interface UserContextType {
  userProfile: UserProfile;
  updateUserProfile: (newProfile: UserProfile, userId?: string) => Promise<void>;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile>({
    username: 'Anonymous',
    avatar: '', // No default avatar - Instagram style
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const loadProfile = () => {
      try {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile) {
        const parsedProfile = JSON.parse(storedProfile);

        // Ignore if it's Anonymous - Firebase will load the real profile
        if (parsedProfile.username === 'Anonymous') {
          return;
        }
        
        setUserProfile(parsedProfile);
      }
      } catch (error) {
        console.error('Failed to parse user profile from localStorage', error);
        setUserProfile({ username: 'Anonymous', avatar: '' });
      }
    };

    loadProfile();

    // Listen for custom storage event (when FirebaseContext updates localStorage)
    const handleStorageUpdate = (e: Event) => {
      loadProfile();
    };

    window.addEventListener('userProfileUpdated', handleStorageUpdate);

    // Also listen for storage events from other tabs (standard browser behavior)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userProfile' && e.newValue) {
        try {
          const parsedProfile = JSON.parse(e.newValue);
          setUserProfile(parsedProfile);
        } catch (error) {
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('userProfileUpdated', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const updateUserProfile = async (newProfile: UserProfile, userId?: string) => {
    try {
      setIsLoading(true);

      // Firebase auth uid is the user key
      const uid = userId || newProfile.uid;

      if (uid) {
        const userRef = doc(db, 'users', uid);

        const mergedProfile = {
          uid,
          username: newProfile.username || newProfile.displayName || 'Anonymous',
          displayName: newProfile.username || newProfile.displayName || 'Anonymous',
          handle: newProfile.handle || '',
          avatar: newProfile.avatar || newProfile.avatarUrl || '',
          avatarUrl: newProfile.avatarUrl || newProfile.avatar || '',
          bio: newProfile.bio || '',
          xHandle: newProfile.xHandle || '',
          updatedAt: new Date(),
        };

        await setDoc(userRef, mergedProfile, { merge: true });

        const fullProfile: UserProfile = {
          uid: mergedProfile.uid,
          username: mergedProfile.username,
          displayName: mergedProfile.displayName,
          handle: mergedProfile.handle,
          avatar: mergedProfile.avatar,
          avatarUrl: mergedProfile.avatarUrl,
          bio: mergedProfile.bio,
          xHandle: mergedProfile.xHandle,
        };

        localStorage.setItem('userProfile', JSON.stringify(fullProfile));

        // Notify FirebaseContext about the update
        window.dispatchEvent(new CustomEvent('profileUpdatedFromUserContext', {
          detail: fullProfile
        }));

        // Update local state
        setUserProfile(fullProfile);
      } else {
        // If no user id, just update local state
        setUserProfile(newProfile);
        localStorage.setItem('userProfile', JSON.stringify(newProfile));
        window.dispatchEvent(new Event('userProfileUpdated'));
      }
    } catch (error) {
      console.error('Failed to update user profile:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const value = useMemo(() => ({ userProfile, updateUserProfile, isLoading }), [userProfile, isLoading]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
