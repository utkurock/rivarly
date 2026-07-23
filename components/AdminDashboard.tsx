import React, { useState, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { collection, query, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import type { AdminStats, MarketWithCreator } from '../types';
import NewsManagement from './NewsManagement';
import { verifyAdminPassword, setStoredAdminPassword, getStoredAdminPassword } from '../services/newsService';

const AdminDashboard: React.FC = () => {
  const { user, userProfile } = useFirebase();

  const [isAdmin, setIsAdmin] = useState(() => !!getStoredAdminPassword());
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [markets, setMarkets] = useState<MarketWithCreator[]>([]);
  const [sortBy, setSortBy] = useState<'resolvesAt' | 'createdAt' | 'volumeUSD'>('resolvesAt');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'pending' | 'resolved'>('open');
  const [resolving, setResolving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'markets' | 'news'>('markets');

  // Admin gate: validate the password against the server (never in the client).
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthChecking(true);
    setAuthError(false);
    const ok = await verifyAdminPassword(passwordInput);
    setAuthChecking(false);
    if (ok) {
      setStoredAdminPassword(passwordInput);
      setIsAdmin(true);
    } else {
      setAuthError(true);
    }
  };

  // Fetch admin stats and markets
  useEffect(() => {
    if (!isAdmin || !user) return;

    const fetchAdminData = async () => {
      setLoading(true);
      try {
        // Fetch all markets
        const marketsRef = collection(db, 'markets');
        const marketsQuery = query(marketsRef, orderBy('createdAt', 'desc'));
        const marketsSnapshot = await getDocs(marketsQuery);

        const marketsData: MarketWithCreator[] = [];
        marketsSnapshot.forEach((doc) => {
          const data = doc.data();
          marketsData.push({
            id: doc.id,
            title: data.title || data.question || '',
            category: data.category || 'Other',
            probability: data.probability || 0.5,
            resolvesAt: data.resolvesAt || data.expiryDate || new Date().toISOString(),
            status: data.status || 'open',
            creatorAddress: data.creator || '',
            creatorUsername: data.creatorProfile?.username,
            creatorAvatar: data.creatorProfile?.avatar,
            createdAt: data.createdAt?.toDate() || new Date(),
            yesBets: data.yesBets || 0,
            noBets: data.noBets || 0,
            totalBets: (data.yesBets || 0) + (data.noBets || 0),
            participantCount: 0, // Will be calculated from bets collection
            volumeUSD: data.metrics?.totalVolumeUSD || data.volumeUSD || 0,
            metrics: data.metrics,
          } as MarketWithCreator);
        });

        // Fetch users count
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(query(usersRef));
        const totalUsers = usersSnapshot.size;

        // Calculate stats
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const totalVolume = marketsData.reduce((sum, m) => sum + (m.volumeUSD || 0), 0);
        const dailyVolume = marketsData
          .filter(m => m.createdAt && m.createdAt >= oneDayAgo)
          .reduce((sum, m) => sum + (m.volumeUSD || 0), 0);
        const weeklyVolume = marketsData
          .filter(m => m.createdAt && m.createdAt >= oneWeekAgo)
          .reduce((sum, m) => sum + (m.volumeUSD || 0), 0);

        const activeMarkets = marketsData.filter(m => m.status === 'open').length;
        const resolvedMarkets = marketsData.filter(m => m.status === 'resolved_yes' || m.status === 'resolved_no').length;
        const pendingResolution = marketsData.filter(m => m.status === 'pending_resolution' || (m.status === 'expired' && new Date(m.resolvesAt) < now)).length;

        setStats({
          totalUsers,
          totalMarkets: marketsData.length,
          totalVolume,
          dailyVolume,
          weeklyVolume,
          activeMarkets,
          resolvedMarkets,
          pendingResolution,
        });

        setMarkets(marketsData);
      } catch (error) {
        console.error('Error fetching admin data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [isAdmin, user]);

  // Resolve market
  const handleResolveMarket = async (marketId: string, outcome: 'yes' | 'no') => {
    if (!confirm(`Are you sure you want to resolve this market as ${outcome.toUpperCase()}?`)) {
      return;
    }

    setResolving(marketId);
    try {
      // Update market status
      const marketRef = doc(db, 'markets', marketId);
      await updateDoc(marketRef, {
        status: outcome === 'yes' ? 'resolved_yes' : 'resolved_no',
        resolvedAt: new Date().toISOString(),
        resolvedBy: userProfile?.uid ?? user?.uid ?? 'admin',
        probability: outcome === 'yes' ? 1 : 0, // Set final probability
      });

      // Update local state
      setMarkets(prev => prev.map(m =>
        m.id === marketId
          ? { ...m, status: outcome === 'yes' ? 'resolved_yes' : 'resolved_no' }
          : m
      ));

      alert(`Market resolved as ${outcome.toUpperCase()} successfully!`);
    } catch (error) {
      console.error('Error resolving market:', error);
      alert('Failed to resolve market. Please try again.');
    } finally {
      setResolving(null);
    }
  };

  // Filter and sort markets
  const getFilteredAndSortedMarkets = () => {
    let filtered = markets;

    // Apply status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'open') {
        filtered = filtered.filter(m => m.status === 'open');
      } else if (filterStatus === 'pending') {
        // Pending includes both expired and pending_resolution
        filtered = filtered.filter(m => m.status === 'expired' || m.status === 'pending_resolution');
      } else if (filterStatus === 'resolved') {
        // Resolved includes both resolved_yes and resolved_no
        filtered = filtered.filter(m => m.status === 'resolved_yes' || m.status === 'resolved_no');
      }
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      if (sortBy === 'resolvesAt') {
        return new Date(a.resolvesAt).getTime() - new Date(b.resolvesAt).getTime();
      } else if (sortBy === 'createdAt') {
        return b.createdAt.getTime() - a.createdAt.getTime();
      } else {
        return (b.volumeUSD || 0) - (a.volumeUSD || 0);
      }
    });
  };

  // Admin gate: require the admin password
  if (!isAdmin) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="max-w-md mx-auto text-center py-16 px-8 bg-background-card rounded-xl border border-border-default shadow-sm">
          <svg className="w-16 h-16 mx-auto mb-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Admin Access</h2>
          <p className="text-text-secondary mb-6">Enter the admin password to access the dashboard.</p>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Admin password"
              className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors"
              autoFocus
            />
            {authError && (
              <p className="text-sm text-red-400">Incorrect password. Please try again.</p>
            )}
            <button
              type="submit"
              disabled={authChecking || !passwordInput}
              className="w-full px-4 py-2 bg-inverse hover:bg-inverse-hover !text-inverse-ink font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {authChecking ? 'Checking…' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }


  const filteredMarkets = getFilteredAndSortedMarkets();

  return (
    <div className="min-h-screen bg-background-body">
      <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Admin Dashboard</h1>
            <p className="text-text-secondary">Manage markets, news, and platform statistics</p>
          </div>
          <div className="px-4 py-2 bg-blue-500/10 text-blue-400 rounded-lg text-sm font-medium border border-blue-500/20">
            Admin Access
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-background-card rounded-xl border border-border-default shadow-sm p-1 flex gap-1">
          <button
            onClick={() => setActiveTab('markets')}
            className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'markets'
                ? 'bg-inverse !text-inverse-ink shadow-sm'
                : 'bg-transparent text-text-secondary hover:bg-background-hover'
            }`}
          >
            Markets Management
          </button>
          <button
            onClick={() => setActiveTab('news')}
            className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'news'
                ? 'bg-inverse !text-inverse-ink shadow-sm'
                : 'bg-transparent text-text-secondary hover:bg-background-hover'
            }`}
          >
            News Management
          </button>
        </div>

        {/* Render Tab Content */}
        {activeTab === 'news' ? (
          <NewsManagement />
        ) : (
          <>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-background-card border border-border-default rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Total Users</h3>
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-text-primary">{stats.totalUsers}</div>
          </div>

          <div className="bg-background-card border border-border-default rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Total Markets</h3>
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-text-primary">{stats.totalMarkets}</div>
            <div className="mt-2 text-sm text-text-secondary">
              {stats.activeMarkets} active • {stats.pendingResolution} pending
            </div>
          </div>

          <div className="bg-background-card border border-border-default rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Total Volume</h3>
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-text-primary">${stats.totalVolume.toFixed(2)}</div>
            <div className="mt-2 text-sm text-text-secondary">
              Daily: ${stats.dailyVolume.toFixed(2)} • Weekly: ${stats.weeklyVolume.toFixed(2)}
            </div>
          </div>

          <div className="bg-background-card border border-border-default rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-text-secondary">Resolution Status</h3>
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-text-primary">{stats.pendingResolution}</div>
            <div className="mt-2 text-sm text-text-secondary">
              {stats.resolvedMarkets} resolved
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-background-card border border-border-default rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-secondary">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-1.5 bg-background-hover border border-border-default rounded-lg text-text-primary text-sm focus:outline-none focus:border-white transition-colors"
              >
                <option value="all">All Markets</option>
                <option value="open">Open</option>
                <option value="pending">Pending Resolution</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-secondary">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-1.5 bg-background-hover border border-border-default rounded-lg text-text-primary text-sm focus:outline-none focus:border-white transition-colors"
              >
                <option value="resolvesAt">End Date (Earliest)</option>
                <option value="createdAt">Created Date (Latest)</option>
                <option value="volumeUSD">Volume (Highest)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Markets Table */}
      <div className="bg-background-card border border-border-default rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border-default">
          <h2 className="text-xl font-bold text-text-primary">Markets Management</h2>
          <p className="text-sm text-text-secondary mt-1">
            Showing {filteredMarkets.length} market{filteredMarkets.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Market</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Creator</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">End Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Volume</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Bets</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-secondary">
                    Loading markets...
                  </td>
                </tr>
              ) : filteredMarkets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-secondary">
                    No markets found
                  </td>
                </tr>
              ) : (
                filteredMarkets.map((market) => {
                  const endDate = new Date(market.resolvesAt);
                  const isPastDue = endDate < new Date();
                  const canResolve = market.status === 'open' || market.status === 'expired' || market.status === 'pending_resolution';

                  return (
                    <tr key={market.id} className="hover:bg-background-hover transition-colors">
                      <td className="px-6 py-4">
                        <div className="max-w-xs">
                          <div className="text-sm font-medium text-text-primary truncate">{market.title}</div>
                          <div className="text-xs text-text-secondary mt-1">{market.category}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {market.creatorAvatar ? (
                            <img src={market.creatorAvatar} alt="" className="w-6 h-6 rounded-full" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                          )}
                          <div>
                            <div className="text-sm text-text-primary">{market.creatorUsername || 'Anonymous'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm ${isPastDue ? 'text-red-400' : 'text-text-primary'}`}>
                          {endDate.toLocaleDateString()}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {endDate.toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          market.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' :
                          market.status === 'expired' ? 'bg-yellow-500/10 text-yellow-400' :
                          market.status === 'pending_resolution' ? 'bg-orange-500/10 text-orange-400' :
                          market.status === 'resolved_yes' ? 'bg-emerald-500/10 text-emerald-400' :
                          market.status === 'resolved_no' ? 'bg-red-500/10 text-red-400' :
                          'bg-background-hover text-text-secondary'
                        }`}>
                          {market.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-primary font-medium">
                        ${(market.volumeUSD || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary font-medium">{market.yesBets || 0} YES</span>
                          <span className="text-text-tertiary">•</span>
                          <span className="text-text-primary font-medium">{market.noBets || 0} NO</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {canResolve ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResolveMarket(market.id, 'yes')}
                              disabled={resolving === market.id}
                              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                            >
                              YES
                            </button>
                            <button
                              onClick={() => handleResolveMarket(market.id, 'no')}
                              disabled={resolving === market.id}
                              className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                            >
                              NO
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary">
                            {market.status === 'resolved_yes' ? 'Resolved YES' :
                             market.status === 'resolved_no' ? 'Resolved NO' : '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
