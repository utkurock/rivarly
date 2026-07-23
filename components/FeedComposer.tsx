import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { validateFile, compressImage } from '../services/feed';
import { useCustomModal } from '../hooks/useCustomModal';
import CustomModal from './CustomModal';
import { detectMarketLinks } from '../utils/marketLinkDetector';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import type { Market } from '../types';


interface FeedComposerProps {
  onPostCreated?: () => void;
  marketId?: string;
}

const FeedComposer: React.FC<FeedComposerProps> = ({ onPostCreated, marketId }) => {
    const { user, userProfile, createPost } = useFirebase();
    const { modal, hideModal, showError } = useCustomModal();
    const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [previewMarketId, setPreviewMarketId] = useState<string | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(marketId || null);
  const [isMarketModalOpen, setIsMarketModalOpen] = useState(false);
  const [userMarkets, setUserMarkets] = useState<Market[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);

  const maxChars = 500;
  const remainingChars = maxChars - text.length;
  const canPost = (text.trim().length > 0 || files.length > 0) && !isSubmitting;

  // Detect market links in text and show preview
  useEffect(() => {
    const links = detectMarketLinks(text);
    if (links.length > 0) {
      // Show preview for the first detected market
      setPreviewMarketId(links[0].marketId);
    } else if (selectedMarketId) {
      // If no links but selected market exists, show selected market
      setPreviewMarketId(selectedMarketId);
    } else {
      setPreviewMarketId(null);
    }
  }, [text, selectedMarketId]);

  // Load user's created markets
  useEffect(() => {
    const loadUserMarkets = async () => {
      if (!user?.uid || !isMarketModalOpen) return;

      setIsLoadingMarkets(true);
      try {
        // Query markets created by the current user
        const marketsQuery = query(
          collection(db, 'markets'),
          where('creator', '==', user.uid),
          orderBy('createdAt', 'desc'),
          // Note: requires composite index if orderBy is used with where
        );

        try {
          const snapshot = await getDocs(marketsQuery);
          const markets: Market[] = [];
          snapshot.forEach((doc) => {
            markets.push({
              id: doc.id,
              ...doc.data(),
            } as Market);
          });
          setUserMarkets(markets);
        } catch (error: any) {
          // If index error, try without orderBy
          if (error.code === 'failed-precondition') {
            console.warn('Composite index required, fetching without orderBy');
            const simpleQuery = query(
              collection(db, 'markets'),
              where('creator', '==', user.uid)
            );
            const snapshot = await getDocs(simpleQuery);
            const markets: Market[] = [];
            snapshot.forEach((doc) => {
              markets.push({
                id: doc.id,
                ...doc.data(),
              } as Market);
            });
            // Sort client-side
            markets.sort((a, b) => {
              const getDate = (createdAt: any): number => {
                if (!createdAt) return 0;
                if (createdAt instanceof Date) return createdAt.getTime();
                if (createdAt?.toDate) return createdAt.toDate().getTime(); // Firestore Timestamp
                if (typeof createdAt === 'string' || typeof createdAt === 'number') {
                  return new Date(createdAt).getTime();
                }
                return 0;
              };
              return getDate((b as any).createdAt) - getDate((a as any).createdAt);
            });
            setUserMarkets(markets);
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error('Error loading user markets:', error);
        setUserMarkets([]);
      } finally {
        setIsLoadingMarkets(false);
      }
    };

    loadUserMarkets();
  }, [user?.uid, isMarketModalOpen]);

  const handleFileUpload = useCallback(async (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;

    const validFiles: File[] = [];
    const previews: string[] = [];
    const progress: number[] = [];

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      
      // Validate file
      const validation = validateFile(file);
      if (!validation.valid) {
        showError('Invalid File', validation.error!);
        continue;
      }

      try {
        // Compress image if needed
        const compressedFile = await compressImage(file);
        validFiles.push(compressedFile);
        
        // Create preview
        const preview = URL.createObjectURL(compressedFile);
        previews.push(preview);
        progress.push(0);
      } catch (error) {
        console.error('Error processing file:', error);
        showError('File Processing Error', 'Failed to process the file');
      }
    }

    setFiles(prev => [...prev, ...validFiles]);
    setImagePreviews(prev => [...prev, ...previews]);
    setUploadProgress(prev => [...prev, ...progress]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [showError]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      const newPreviews = prev.filter((_, i) => i !== index);
      // Revoke the URL to free memory
      URL.revokeObjectURL(prev[index]);
      return newPreviews;
    });
    setUploadProgress(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || !user || !createPost) return;

    setIsSubmitting(true);
    try {
      // Upload media files first (using base64 - no CORS issues)
      const mediaItems: any[] = [];
      for (const file of files) {
        try {
          const { uploadMediaAsBase64 } = await import('../services/feed');
          const mediaItem = await uploadMediaAsBase64(file);
          mediaItems.push(mediaItem);
        } catch (uploadError) {
          console.error('Media upload failed:', uploadError);
          throw new Error('Failed to upload media');
        }
      }

      // Create post using Firebase Context (uses feed.createPost internally)
      // Use selectedMarketId if available, otherwise try to detect from text
      const marketIdToUse = selectedMarketId || (previewMarketId || null);
      
      const postData = {
        content: text.trim(),
        images: mediaItems.map(m => m.url), // For backwards compatibility
        likes: 0,
        comments: 0,
        commentCount: 0,
        shares: 0,
        likedBy: [],
        sharedBy: [],
        marketId: marketIdToUse, // Add marketId to post data
      };

      const postId = await createPost(postData);

      // Reset form
      setText('');
      setFiles([]);
      setImagePreviews([]);
      setUploadProgress([]);
      setPreviewMarketId(null);
      setSelectedMarketId(null);

      onPostCreated?.();
    } catch (error) {
      console.error('❌ Error creating post:', error);
      showError('Post Failed', error instanceof Error ? error.message : 'Failed to create post.');
    } finally {
      setIsSubmitting(false);
    }
  }, [canPost, user, createPost, text, files, marketId, showError, onPostCreated]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    handleFileUpload(droppedFiles);
  }, [handleFileUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    
    if (files.length > 0) {
      const fileList = new DataTransfer();
      files.forEach(file => fileList.items.add(file));
      handleFileUpload(fileList.files);
    }
  }, [handleFileUpload]);

  return (
    <>
      {/* Twitter-style composer */}
      <div className="flex items-start gap-4 py-4 px-2">
        {/* Avatar */}
        {userProfile?.avatar ? (
          <img 
            src={userProfile.avatar} 
            alt="Your Avatar" 
            className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="h-12 w-12 bg-background-active rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
        
        {/* Main content */}
        <div className="flex-grow">
          {/* Text input */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onPaste={handlePaste}
              className="w-full px-0 py-2 bg-transparent text-text-primary placeholder-text-tertiary text-xl resize-none focus:outline-none border-none"
              placeholder="What's happening?"
              rows={4}
              maxLength={maxChars}
            />
            
            {/* Media previews */}
            {imagePreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl overflow-hidden">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={preview} 
                      alt={`Preview ${index + 1}`}
                      className="w-full h-48 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center text-lg shadow-lg"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Attached market preview */}
            {selectedMarketId && (
              <div className="mt-3 flex items-center justify-between border border-border-default rounded-xl bg-background-card px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary flex-shrink-0">
                    <path d="m21 3-9 9-4-4-6 6"/>
                    <path d="M21 8V3h-5"/>
                  </svg>
                  <span className="text-sm font-medium text-text-primary truncate">
                    {userMarkets.find(m => m.id === selectedMarketId)?.title
                      || userMarkets.find(m => m.id === selectedMarketId)?.question
                      || `Market #${selectedMarketId.slice(0, 8)}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMarketId(null);
                    setPreviewMarketId(null);
                  }}
                  className="ml-3 text-text-tertiary hover:text-white text-lg flex-shrink-0"
                >
                  ×
                </button>
              </div>
            )}
            
            {/* Bottom bar */}
            <div className="flex items-center justify-between pt-3 border-t border-border-default">
              <div className="flex items-center gap-4">
                {/* Media upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 flex items-center justify-center text-text-primary hover:bg-background-hover rounded-full transition-colors"
                  title="Upload photo or video"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/>
                    <path d="m14 19.5 3-3 3 3"/>
                    <path d="M17 22v-5.5"/>
                    <circle cx="9" cy="9" r="2"/>
                  </svg>
                </button>
                
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4"
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />

                {/* Markets button */}
                <button
                  type="button"
                  onClick={() => setIsMarketModalOpen(true)}
                  className={`w-10 h-10 flex items-center justify-center hover:bg-background-hover rounded-full transition-colors ${
                    selectedMarketId ? 'text-text-primary' : 'text-text-primary'
                  }`}
                  title="Attach your market"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M14.828 14.828 21 21"/>
                    <path d="M21 16v5h-5"/>
                    <path d="m21 3-9 9-4-4-6 6"/>
                    <path d="M21 8V3h-5"/>
                  </svg>
                </button>
              </div>
              
              {/* Post button */}
              <div className="flex items-center gap-3">
                {remainingChars < 20 && (
                  <span className={`text-sm ${remainingChars < 0 ? 'text-red-500' : 'text-text-secondary'}`}>
                    {remainingChars}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={!canPost}
                  className="px-6 py-2 bg-inverse text-inverse-ink text-sm font-semibold rounded-full hover:bg-inverse-hover disabled:bg-background-active disabled:text-text-tertiary disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

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

      {/* Market Selection Modal */}
      {isMarketModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setIsMarketModalOpen(false)}>
          <div className="bg-background-card rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-border-default flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">Select a Market</h2>
              <button
                onClick={() => setIsMarketModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center hover:bg-background-hover rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18"/>
                  <path d="M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingMarkets ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-text-secondary">Loading your markets...</div>
                </div>
              ) : userMarkets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary mb-4">
                    <path d="M14.828 14.828 21 21"/>
                    <path d="M21 16v5h-5"/>
                    <path d="m21 3-9 9-4-4-6 6"/>
                    <path d="M21 8V3h-5"/>
                  </svg>
                  <p className="text-text-secondary text-lg mb-2">No markets found</p>
                  <p className="text-text-tertiary text-sm">Create a market first to share it in your posts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userMarkets.map((market) => (
                    <button
                      key={market.id}
                      onClick={() => {
                        setSelectedMarketId(market.id);
                        setIsMarketModalOpen(false);
                      }}
                      className={`w-full text-left p-4 border-2 rounded-xl transition-all hover:border-white ${
                        selectedMarketId === market.id ? 'border-white bg-background-hover' : 'border-border-default'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-text-primary mb-1 truncate">
                            {market.title || market.question || 'Untitled Market'}
                          </h3>
                          <div className="flex items-center gap-3 text-sm text-text-secondary">
                            <span className="px-2 py-0.5 bg-background-hover rounded text-xs font-medium">
                              {market.category || 'Other'}
                            </span>
                            {market.status && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                market.status === 'open' ? 'bg-green-500/10 text-green-400' : 'bg-background-hover text-text-secondary'
                              }`}>
                                {market.status}
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedMarketId === market.id && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-primary flex-shrink-0">
                            <path d="M20 6L9 17l-5-5"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedComposer;