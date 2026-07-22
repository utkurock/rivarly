import React, { useEffect, useMemo, useState } from 'react';
import type { NewMarket } from '../types';
import { CATEGORIES } from '../constants';
import DateTimePicker from './DateTimePicker';

interface CreateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateMarket: (market: NewMarket) => void;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
// Upper bound so the picker can't run off to absurd years like 123213.
const MAX_YEARS_AHEAD = 5;

const CreateMarketModal: React.FC<CreateMarketModalProps> = ({ isOpen, onClose, onCreateMarket }) => {
  // Form state
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState(CATEGORIES[1]);
  const [expiryDate, setExpiryDate] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [newSource, setNewSource] = useState('');
  const [info, setInfo] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuestion('');
      setCategory(CATEGORIES[1]);
      setExpiryDate('');
      setSources([]);
      setNewSource('');
      setInfo('');
      setIsSubmitting(false);
      setShowSuccess(false);
    }
  }, [isOpen]);

  // Allowed expiry window: from 1 hour ahead up to MAX_YEARS_AHEAD.
  // Recomputed each time the modal opens so it stays current.
  const { minDate, maxDate } = useMemo(() => {
    const now = Date.now();
    const max = new Date(now);
    max.setFullYear(max.getFullYear() + MAX_YEARS_AHEAD);
    return { minDate: new Date(now + ONE_HOUR_MS), maxDate: max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const basicsValid = useMemo(() => {
    const q = question.trim();
    if (q.length < 8 || q.length > 180) return false;
    const expiry = new Date(expiryDate).getTime();
    if (!expiry) return false;
    if (expiry < Date.now() + ONE_HOUR_MS) return false;
    if (expiry > maxDate.getTime()) return false;
    return true;
  }, [question, expiryDate, maxDate]);

  const handleCreate = async () => {
    if (!basicsValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const marketData: NewMarket = {
        question: question.trim(),
        category,
        expiryDate,
        sources: sources.length ? sources : undefined,
        info: info.trim() ? info : undefined,
      };
      await onCreateMarket(marketData);
      setShowSuccess(true);

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to create market', e);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[9998] flex justify-center items-center p-2 md:p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-0 w-full max-w-[95vw] md:max-w-2xl max-h-[95vh] overflow-y-auto m-2 md:m-4 relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        {/* Success Notification */}
        {showSuccess && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-green-50 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Market Created!</h3>
              <p className="text-gray-600">Your market has been created successfully</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between rounded-t-xl z-10">
          <h3 className="text-lg md:text-xl font-bold text-gray-900">Create Market</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Market Question <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-black transition-colors placeholder-gray-400 resize-none"
                placeholder="e.g., Will ETH reach $5000 by the end of Q4?"
              />
              {!question.trim() && <p className="mt-1.5 text-xs text-amber-600">Question is required.</p>}
              {!!question.trim() && (question.trim().length < 8 || question.trim().length > 180) && (
                <p className="mt-1.5 text-xs text-amber-600">Question must be 8 to 180 characters.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-black transition-colors"
              >
                {CATEGORIES.filter(c => c !== 'All').map(cat => (<option key={cat} value={cat}>{cat}</option>))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expiry Date <span className="text-red-500">*</span>
              </label>
              <DateTimePicker
                value={expiryDate}
                onChange={setExpiryDate}
                min={minDate}
                max={maxDate}
                placeholder="Select expiry date & time"
              />
              <p className="text-xs text-gray-500 mt-1.5">Minimum: 1 hour from now · up to {MAX_YEARS_AHEAD} years ahead</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sources (Optional)</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-black transition-colors placeholder-gray-400"
                  placeholder="https://example.com/source"
                />
                <button
                  type="button"
                  onClick={() => { if (newSource.trim()) { setSources(prev => [...prev, newSource.trim()]); setNewSource(''); } }}
                  className="px-5 py-2.5 bg-black hover:bg-gray-800 !text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Add
                </button>
              </div>
              {!!sources.length && (
                <div className="mt-3 space-y-2">
                  {sources.map((source, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                      <span className="text-sm text-gray-900 truncate flex-1 mr-3">{source}</span>
                      <button
                        type="button"
                        onClick={() => setSources(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Info (Optional)</label>
              <textarea
                rows={4}
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-black transition-colors placeholder-gray-400 resize-none"
                placeholder="Add additional context, notes, or description for this market"
              />
            </div>
          </div>
        </div>

        {/* Footer with action buttons */}
        <div className="sticky bottom-0 p-6 border-t border-gray-200 bg-white/95 backdrop-blur-sm rounded-b-xl">
          <div className="flex justify-between items-center">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleCreate}
              disabled={!basicsValid || isSubmitting}
              className="px-8 py-2.5 rounded-lg bg-black hover:bg-gray-800 !text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Market'
              )}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fade-in-up { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default CreateMarketModal;
