import React, { useState, useEffect } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { getAllNews, createNewsItem, updateNewsItem, deleteNewsItem } from '../services/newsService';
import type { NewsItem } from '../types';

const NewsManagement: React.FC = () => {
  const { user, userProfile } = useFirebase();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    image: '',
    description: '',
    link: '',
    source: '',
    category: 'ALL',
    publishedAt: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:MM format
  });

  const categories = ['BTC', 'ETH', 'SOL', 'XLM', 'ALL'];

  // Fetch all news
  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const newsData = await getAllNews();
      setNews(newsData);
    } catch (error) {
      console.error('Error fetching news:', error);
    } finally {
      setLoading(false);
    }
  };

  // Open modal for creating or editing
  const handleOpenModal = (newsItem?: NewsItem) => {
    if (newsItem) {
      setEditingNews(newsItem);
      setFormData({
        title: newsItem.title,
        image: newsItem.image,
        description: newsItem.description,
        link: newsItem.link,
        source: newsItem.source,
        category: newsItem.category,
        publishedAt: newsItem.publishedAt.slice(0, 16), // YYYY-MM-DDTHH:MM
      });
    } else {
      setEditingNews(null);
      setFormData({
        title: '',
        image: '',
        description: '',
        link: '',
        source: '',
        category: 'ALL',
        publishedAt: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:MM
      });
    }
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingNews(null);
    setFormData({
      title: '',
      image: '',
      description: '',
      link: '',
      source: '',
      category: 'ALL',
      publishedAt: new Date().toISOString().slice(0, 16),
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const creatorId = userProfile?.uid ?? user?.uid ?? 'admin';

    try {
      const newsData = {
        ...formData,
        publishedAt: new Date(formData.publishedAt).toISOString(),
      };

      if (editingNews) {
        await updateNewsItem(editingNews.id, newsData);
        alert('News updated successfully!');
      } else {
        await createNewsItem(newsData, creatorId);
        alert('News created successfully!');
      }

      handleCloseModal();
      fetchNews();
    } catch (error) {
      console.error('Error saving news:', error);
      alert('Failed to save news. Please try again.');
    }
  };

  // Handle delete
  const handleDelete = async (newsId: string) => {
    if (!confirm('Are you sure you want to delete this news item?')) {
      return;
    }

    try {
      await deleteNewsItem(newsId);
      alert('News deleted successfully!');
      fetchNews();
    } catch (error) {
      console.error('Error deleting news:', error);
      alert('Failed to delete news. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">News Management</h2>
          <p className="text-text-secondary mt-1">Create and manage news items for the platform</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-inverse hover:bg-inverse-hover !text-inverse-ink font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add News
        </button>
      </div>

      {/* News List */}
      <div className="bg-background-card rounded-xl border border-border-default shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Image</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Published Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-text-secondary">
                    Loading news...
                  </td>
                </tr>
              ) : news.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-text-secondary">
                    No news items yet. Create your first one!
                  </td>
                </tr>
              ) : (
                news.map((item) => (
                  <tr key={item.id} className="hover:bg-background-hover transition-colors">
                    <td className="px-6 py-4">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-16 h-16 object-cover rounded-lg"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        <div className="text-sm font-medium text-text-primary truncate">{item.title}</div>
                        <div className="text-xs text-text-secondary mt-1 truncate">{item.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-text-primary font-medium">{item.source}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs font-semibold bg-background-hover text-text-secondary rounded">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-text-primary">
                        {new Date(item.publishedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {new Date(item.publishedAt).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-medium rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-background-card rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background-card border-b border-border-default px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-text-primary">
                {editingNews ? 'Edit News' : 'Create News'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-text-tertiary hover:text-text-primary transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors"
                  placeholder="Enter news title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Image URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors"
                  placeholder="https://example.com/image.jpg"
                  required
                />
                {formData.image && (
                  <img
                    src={formData.image}
                    alt="Preview"
                    className="mt-2 w-full h-48 object-cover rounded-lg"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors resize-none"
                  placeholder="Enter news description"
                  rows={4}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Link <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={formData.link}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                  className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors"
                  placeholder="https://example.com/news-article"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Source <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors"
                  placeholder="e.g., Cointelegraph, CoinDesk, Bloomberg"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Category (Token) <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors"
                    required
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Published Date & Time <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => setFormData({ ...formData, publishedAt: e.target.value })}
                    className="w-full px-4 py-2 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-white transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-border-default">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-inverse hover:bg-inverse-hover !text-inverse-ink font-semibold rounded-lg transition-colors"
                >
                  {editingNews ? 'Update News' : 'Create News'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-background-hover hover:bg-background-active text-text-secondary font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsManagement;
