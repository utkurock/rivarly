import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from './contexts/ThemeContext';
import { UserProvider } from './contexts/UserContext';
import { FirebaseProvider, useFirebase } from './contexts/FirebaseContext';
import { StellarWalletProvider } from './contexts/StellarWalletContext';
import { ToastProvider } from './contexts/ToastContext';
import { useCustomModal } from './hooks/useCustomModal';
import CustomModal from './components/CustomModal';
import type { Market, NewMarket, Post, UserProfile } from './types';
import { isFirebaseConfigured } from './firebase';

// Component imports
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import MarketDetail from './components/MarketDetail';
import SocialFeed from './components/SocialFeed';
import Profile from './components/Profile';
import PostDetail from './components/PostDetail';
import CreateMarketModal from './components/CreateMarketModal';
import CryptoNewsFeed from './components/CryptoNewsFeed';
import Ecosystem from './components/Ecosystem';
import Tasks from './components/Tasks';
import Leaderboard from './components/Leaderboard';
import MarketTicker from './components/MarketTicker';
import AdminDashboard from './components/AdminDashboard';
import Onboarding from './components/Onboarding';

// Query client configuration. Without Firebase credentials every request is going
// to fail, so skip the retries and let the empty states show straight away.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: isFirebaseConfigured ? 3 : false },
  },
});

const AppContent: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const { createMarket, subscribeToMarkets, subscribeToPosts, createPost } = useFirebase();
  const { modal, hideModal, showSuccess, showError } = useCustomModal();

  // Subscribe to Firebase data
  useEffect(() => {
    const unsubscribeMarkets = subscribeToMarkets((firebaseMarkets) => {
      setMarkets(firebaseMarkets);
    });

    const unsubscribePosts = subscribeToPosts((firebasePosts) => {
      setPosts(firebasePosts);
    });

    return () => {
      if (unsubscribeMarkets) unsubscribeMarkets();
      if (unsubscribePosts) unsubscribePosts();
    };
  }, [subscribeToMarkets, subscribeToPosts]);

  const handleCreateMarket = useCallback(async (newMarketData: NewMarket) => {
    try {
      const marketData = {
        title: newMarketData.question,
        category: newMarketData.category as any,
        probability: 0.5,
        // datetime-local is local wall-clock; parse as local time then store as ISO/UTC.
        resolvesAt: new Date(newMarketData.expiryDate).toISOString(),
        status: 'open' as const,
        // Legacy fields for backward compatibility
        question: newMarketData.question,
        yesPrice: 0.5,
        noPrice: 0.5,
        yesBets: 0,
        noBets: 0,
        trending: false,
        // Persist user-provided description and sources
        info: newMarketData.info || undefined,
        sources: newMarketData.sources && newMarketData.sources.length ? newMarketData.sources : undefined,
        // Initialize metrics
        metrics: {
          volume24hUSD: 0,
          totalVolumeUSD: 0,
          feesUSD: 0,
          feesPct: 1,
        },
      };

      await createMarket(marketData);

      setIsModalOpen(false);
      setActiveCategory(newMarketData.category);
      showSuccess('Market Created!', 'Your market is now live.');
    } catch (error) {
      console.error('Error creating market:', error);
      showError('Creation Failed', 'Failed to create market.');
    }
  }, [createMarket, showSuccess, showError]);

  const handleAddPost = useCallback(async (content: string, user: UserProfile) => {
    try {
      await createPost({
        content,
        images: [],
        likes: 0,
        comments: 0,
        commentCount: 0,
        shares: 0,
        likedBy: [],
        sharedBy: [],
      });
      showSuccess('Post Created!', 'Your post is now live.');
    } catch (error) {
      console.error('Error creating post:', error);
      showError('Post Failed', 'Failed to create post.');
    }
  }, [createPost, showSuccess, showError]);

  const handleLikePost = useCallback(async (postId: string) => {
    // Likes are handled inside the feed components
  }, []);

  const handleCommentPost = useCallback(async (postId: string, content: string) => {
    // Comments are handled inside the feed components
  }, []);

  return (
    <BrowserRouter>
      <div className="h-screen font-sans bg-[#0b0c0e] text-[#ececee] flex flex-col overflow-hidden">
        {/* Mobile Header - Only visible on mobile */}
        <div className="md:hidden sticky top-0 z-50 bg-[#0b0c0e] border-b border-[#262830] px-4 py-3 flex items-center justify-between">
          {/* Logo - Clickable */}
          <Link to="/social" className="flex items-center">
            <img src="/starcast-logo.png" alt="Starcast" className="h-7 w-auto object-contain logo-invert" />
          </Link>

          {/* Hamburger Menu Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-[#1c1d22] rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? (
              <svg className="w-6 h-6 text-[#ececee]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-[#ececee]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Market Ticker - Visible on both mobile and desktop */}
        <MarketTicker />

        <div className="flex flex-1 relative overflow-hidden">
          <Sidebar
            onCreateMarket={() => setIsModalOpen(true)}
            isMobileMenuOpen={isSidebarOpen}
            setIsMobileMenuOpen={setIsSidebarOpen}
          />

          <div className="flex-1 flex flex-col">
            <main className="flex-1 overflow-y-auto">
            <Routes>
              {/* Social Feed - First */}
              <Route path="/social" element={
                <SocialFeed
                  posts={posts}
                  onAddPost={(content, user) => handleAddPost(content, user)}
                  onLikePost={handleLikePost}
                  onCommentPost={handleCommentPost}
                />
              } />

              {/* Markets - Second */}
              <Route path="/" element={
                <MainContent
                  activeCategory={activeCategory}
                  setActiveCategory={setActiveCategory}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  onCreateMarket={() => setIsModalOpen(true)}
                />
              } />
              <Route path="/market/:marketId" element={<MarketDetail />} />

              {/* News - Third */}
              <Route path="/news" element={<CryptoNewsFeed />} />

              {/* Ecosystem - Stellar project directory */}
              <Route path="/ecosystem" element={<Ecosystem />} />

              {/* Tasks - earn points */}
              <Route path="/tasks" element={<Tasks />} />

              {/* Leaderboard - points ranking */}
              <Route path="/leaderboard" element={<Leaderboard />} />

              {/* Profile - Fourth */}
              <Route path="/profile/:userId?" element={<Profile />} />

              {/* Other routes */}
              <Route path="/feed" element={
                <SocialFeed
                  posts={posts}
                  onAddPost={(content, user) => handleAddPost(content, user)}
                  onLikePost={handleLikePost}
                  onCommentPost={handleCommentPost}
                />
              } />
              <Route path="/post/:postId" element={<PostDetail />} />
              <Route path="/admin" element={<AdminDashboard />} />
            </Routes>
            </main>
          </div>
        </div>

        <CreateMarketModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onCreateMarket={handleCreateMarket}
        />

        {/* First-run onboarding */}
        <Onboarding />

        {/* Custom Modal */}
        <CustomModal
          isOpen={modal.isOpen}
          onClose={hideModal}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          confirmText={modal.confirmText}
          cancelText={modal.cancelText}
          onConfirm={modal.onConfirm}
        />
      </div>
    </BrowserRouter>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <FirebaseProvider>
            <UserProvider>
              <StellarWalletProvider>
                <AppContent />
              </StellarWalletProvider>
            </UserProvider>
          </FirebaseProvider>
        </QueryClientProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
