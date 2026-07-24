import React, { useEffect, useMemo, useState } from 'react';
import type { NewLaunch } from '../types';

export const LAUNCH_CATEGORIES = [
  'DeFi',
  'Payments',
  'NFT',
  'Gaming',
  'Social',
  'Developer Tools',
  'AI',
  'Infrastructure',
  'Other',
] as const;

interface SubmitLaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (launch: NewLaunch) => Promise<void> | void;
}

const field =
  'w-full px-4 py-2.5 bg-background-hover border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-border-strong transition-colors placeholder-text-tertiary';

const SubmitLaunchModal: React.FC<SubmitLaunchModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<string>(LAUNCH_CATEGORIES[0]);
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setTagline('');
      setUrl('');
      setCategory(LAUNCH_CATEGORIES[0]);
      setLogoUrl('');
      setDescription('');
      setSubmitting(false);
    }
  }, [isOpen]);

  const valid = useMemo(() => {
    const n = name.trim();
    const t = tagline.trim();
    const u = url.trim();
    if (n.length < 2 || n.length > 60) return false;
    if (t.length < 6 || t.length > 100) return false;
    if (!/^https?:\/\/.+\..+/.test(u)) return false;
    return true;
  }, [name, tagline, url]);

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        tagline: tagline.trim(),
        url: url.trim(),
        category,
        logoUrl: logoUrl.trim() || undefined,
        description: description.trim() || undefined,
      });
      onClose();
    } catch {
      // Parent surfaces the error toast; keep the modal open so the user can retry.
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[9998] flex justify-center items-center p-2 md:p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-background-card rounded-xl shadow-2xl w-full max-w-[95vw] md:max-w-lg max-h-[95vh] overflow-y-auto relative animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border-default bg-background-card/95 backdrop-blur-sm rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Submit a launch</h2>
            <p className="text-xs text-text-secondary mt-0.5">Share a product for the community to back with stake power.</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Product name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} placeholder="e.g., Lusty Finance" />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tagline</label>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={100} className={field} placeholder="One line on what it does" />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Link</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="https://yourproduct.com" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} appearance-none cursor-pointer`}>
                {LAUNCH_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Logo URL <span className="text-text-tertiary">(optional)</span></label>
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={field} placeholder="https://…/logo.png" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Description <span className="text-text-tertiary">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={600}
              className={`${field} resize-none`}
              placeholder="What makes it worth backing?"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 px-6 py-4 border-t border-border-default bg-background-card/95 backdrop-blur-sm rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-background-hover hover:bg-background-active text-text-secondary text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="flex-1 py-2.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />}
            {submitting ? 'Submitting…' : 'Submit launch'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmitLaunchModal;
