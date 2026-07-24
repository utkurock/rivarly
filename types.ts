export interface Market {
  id: string;
  title: string;
  category: 'Crypto' | 'Ecosystem' | 'Other';
  probability: number;           // 0..1
  sourceUrl?: string;            // external source link
  sources?: string[];            // array of source URLs
  info?: string;                 // market info/analysis
  resolvesAt: string;            // ISO date
  status: 'open' | 'expired' | 'pending_resolution' | 'resolved_yes' | 'resolved_no';
  // Legacy fields for backward compatibility
  question?: string;             // maps to title
  creator?: string;
  creatorProfile?: {
    username: string;
    avatar?: string;
  };
  yesPrice?: number;
  noPrice?: number;
  trending?: boolean;
  yesBets?: number;
  noBets?: number;
  volumeUSD?: number;
  metrics?: {
    volume24hUSD: number;
    totalVolumeUSD: number;
    feesUSD: number;
    feesPct: number;
  };
}

export interface NewMarket {
  question: string;
  category: string;
  expiryDate: string;
  sources?: string[];
  info?: string;
}

export interface UserProfile {
  uid?: string;
  username: string;
  displayName?: string; // Alias for username, used in posts
  handle?: string; // Unique username handle (e.g., "johndoe" without @)
  avatar: string;
  avatarUrl?: string; // Alias for avatar, used in posts
  bio?: string;
  xHandle?: string;
}

export interface Post {
  id: string;
  user: UserProfile;
  timestamp: string;
  content: string;
  images?: string[]; // Array of image URLs
  market?: Market;
  likes: number;
  comments: number;
  likedBy: string[]; // Array of user ids who liked this post
  commentCount: number; // Actual comment count
  shares?: number; // Number of shares
  sharedBy?: string[]; // Array of user ids who shared this post
}

// Admin Dashboard Types
export interface AdminStats {
  totalUsers: number;
  totalMarkets: number;
  totalVolume: number; // All time
  dailyVolume: number;
  weeklyVolume: number;
  activeMarkets: number;
  resolvedMarkets: number;
  pendingResolution: number;
}

export interface NewsItem {
  id: string;
  title: string;
  image: string;
  description: string;
  link: string;
  source: string; // News source (e.g., Cointelegraph, CoinDesk, etc.)
  category: string; // Primary token/topic: BTC, ETH, XLM, Crypto, etc.
  tags?: string[]; // All detected tags (e.g., ["XLM", "Crypto"]); falls back to [category]
  publishedAt: string; // ISO date
  createdAt: string; // ISO date
  createdBy: string; // Admin user id
}

export interface MarketWithCreator extends Market {
  creatorAddress: string;
  creatorUsername?: string;
  creatorAvatar?: string;
  createdAt: Date;
  totalBets: number;
  participantCount: number;
}

// Product Hunt-style launch. Community ranks it by "stake power" — each voter's
// points act as their vote weight (votes never spend points). All voting is an
// on-chain Stellar action, verified and tallied by the trusted server.
export type LaunchNetwork = 'mainnet' | 'testnet';

export interface Launch {
  id: string;
  name: string;
  tagline: string;               // one-line pitch
  url: string;                   // product link
  category: string;
  network: LaunchNetwork;        // where the product actually runs today
  description?: string;
  logoUrl?: string;              // optional square logo
  tags?: string[];
  twitter?: string;              // X handle, stored without the @
  github?: string;               // repo URL, optional
  submittedBy: string;           // uid
  submitterProfile?: {
    username: string;
    avatar?: string;
  };
  voteCount: number;             // distinct active voters (server-owned)
  voteWeight: number;            // summed stake power (server-owned)
  status: 'live' | 'hidden';
  createdAt?: unknown;           // Firestore Timestamp
}

export interface NewLaunch {
  name: string;
  tagline: string;
  url: string;
  category: string;
  network: LaunchNetwork;
  description?: string;
  logoUrl?: string;
  tags?: string[];
  twitter?: string;
  github?: string;
}
