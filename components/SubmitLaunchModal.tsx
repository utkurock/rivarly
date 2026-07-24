import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { processLogoFile } from '../services/launchService';
import type { LaunchNetwork, NewLaunch } from '../types';

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

const STEPS = [
  { key: 'product', label: 'Product', hint: 'The essentials people see first' },
  { key: 'details', label: 'Details', hint: 'Help the community understand it' },
  { key: 'review', label: 'Review', hint: 'Exactly how it will appear' },
] as const;

const NAME_MAX = 60;
const TAGLINE_MAX = 100;
const DESCRIPTION_MAX = 600;
const MAX_TAGS = 4;

const field =
  'w-full px-3.5 py-2.5 bg-background-hover border rounded-lg text-text-primary text-sm focus:outline-none transition-colors placeholder-text-tertiary';
const fieldOk = `${field} border-border-default focus:border-border-strong`;
const fieldBad = `${field} border-base-red/60 focus:border-base-red`;

// Accepts "example.com" as well as a full URL; everything is normalised to https.
const normaliseUrl = (raw: string): string => {
  const v = raw.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
};

const isValidUrl = (raw: string): boolean => {
  const v = normaliseUrl(raw);
  if (!/^https?:\/\/[^\s]+\.[^\s]{2,}/i.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

const hostOf = (raw: string): string => {
  try {
    return new URL(normaliseUrl(raw)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// "@acme", "x.com/acme", "https://twitter.com/acme" → "acme".
const normaliseHandle = (raw: string): string =>
  raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');

// "owner/repo" or any github.com link → "https://github.com/owner/repo".
const normaliseRepo = (raw: string): string => {
  const v = raw.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!v) return '';
  const path = v.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
  return /^[\w.-]+\/[\w.-]+$/.test(path) ? `https://github.com/${path}` : v;
};

const isRepoUrl = (raw: string): boolean => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i.test(normaliseRepo(raw));

const NETWORKS: { key: LaunchNetwork; label: string; hint: string }[] = [
  { key: 'mainnet', label: 'Mainnet', hint: 'Live with real funds' },
  { key: 'testnet', label: 'Testnet', hint: 'Still on test funds' },
];

const Counter: React.FC<{ value: string; max: number }> = ({ value, max }) => (
  <span className={`text-[11px] tabular-nums ${value.length > max * 0.9 ? 'text-text-secondary' : 'text-text-tertiary'}`}>
    {value.length}/{max}
  </span>
);

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <p className="mt-1.5 text-xs text-base-red">{message}</p> : null;

const Label: React.FC<{ children: React.ReactNode; required?: boolean; optional?: boolean; right?: React.ReactNode }> = ({
  children,
  required,
  optional,
  right,
}) => (
  <div className="flex items-center justify-between mb-1.5">
    <label className="text-sm font-medium text-text-secondary">
      {children}
      {required && <span className="ml-0.5 text-base-red" aria-hidden="true">*</span>}
      {optional && <span className="ml-1 text-text-tertiary font-normal">(optional)</span>}
    </label>
    {right}
  </div>
);

// Square logo preview with a letter fallback — mirrors the tile used in the list.
const LogoPreview: React.FC<{ url: string; name: string; className?: string }> = ({ url, name, className = 'w-12 h-12' }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const src = url.trim();
  return (
    <div className={`${className} aspect-square rounded-xl overflow-hidden border border-border-default bg-background-card flex-shrink-0`}>
      {src && !failed ? (
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background-hover to-border-default text-text-secondary font-bold">
          {(name.trim().charAt(0) || '?').toUpperCase()}
        </div>
      )}
    </div>
  );
};

const SubmitLaunchModal: React.FC<SubmitLaunchModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<string>(LAUNCH_CATEGORIES[0]);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoLinkMode, setLogoLinkMode] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [description, setDescription] = useState('');
  const [network, setNetwork] = useState<LaunchNetwork | ''>('');
  const [twitter, setTwitter] = useState('');
  const [github, setGithub] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  // Errors stay quiet until the user tries to move on — blurring an empty field
  // should never scold them.
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(0);
    setName('');
    setTagline('');
    setUrl('');
    setCategory(LAUNCH_CATEGORIES[0]);
    setLogoUrl('');
    setLogoLinkMode(false);
    setLogoBusy(false);
    setLogoError('');
    setDragging(false);
    setDescription('');
    setNetwork('');
    setTwitter('');
    setGithub('');
    setTags([]);
    setTagDraft('');
    setAttempted({});
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  // Escape closes; the page behind stays put while the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose, submitting]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const n = name.trim();
    const t = tagline.trim();
    if (n.length < 2) e.name = 'Give your product a name (at least 2 characters).';
    else if (n.length > NAME_MAX) e.name = `Keep it under ${NAME_MAX} characters.`;
    if (t.length < 6) e.tagline = 'A tagline of at least 6 characters helps people get it instantly.';
    else if (t.length > TAGLINE_MAX) e.tagline = `Keep it under ${TAGLINE_MAX} characters.`;
    if (!url.trim()) e.url = 'Add a link so people can try it.';
    else if (!isValidUrl(url)) e.url = "That doesn't look like a valid link.";
    // Uploaded logos are data URLs; only typed links get URL-checked.
    if (logoUrl.trim() && !logoUrl.startsWith('data:') && !isValidUrl(logoUrl)) e.logoUrl = 'Logo link must be a valid URL.';
    if (!network) e.network = 'Tell people whether this runs on mainnet or testnet.';
    const handle = normaliseHandle(twitter);
    if (!handle) e.twitter = 'Add the X account people can follow for updates.';
    else if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) e.twitter = "That doesn't look like a valid X handle.";
    if (github.trim() && !isRepoUrl(github)) e.github = 'Use a github.com repo link, or owner/repo.';
    return e;
  }, [name, tagline, url, logoUrl, network, twitter, github]);

  const stepFields: string[][] = [['name', 'tagline', 'url', 'logoUrl'], ['network', 'twitter', 'github'], []];
  const stepValid = (i: number) => stepFields[i].every((f) => !errors[f]);
  const allValid = Object.keys(errors).length === 0;

  const show = (f: string) => (attempted[step] ? errors[f] : undefined);

  const goNext = () => {
    if (!stepValid(step)) {
      setAttempted((prev) => ({ ...prev, [step]: true }));
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleLogoFile = async (file?: File | null) => {
    if (!file) return;
    setLogoError('');
    setLogoBusy(true);
    try {
      setLogoUrl(await processLogoFile(file));
      setLogoLinkMode(false);
    } catch (err: any) {
      setLogoError(err?.message || 'Could not use that image.');
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '').slice(0, 20);
    if (!t || tags.length >= MAX_TAGS || tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagDraft('');
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagDraft('');
  };

  const handleSubmit = async () => {
    if (!allValid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        tagline: tagline.trim(),
        url: normaliseUrl(url),
        category,
        network: (network || 'mainnet') as LaunchNetwork,
        logoUrl: logoUrl.trim() ? (logoUrl.startsWith('data:') ? logoUrl : normaliseUrl(logoUrl)) : undefined,
        description: description.trim() || undefined,
        tags: tags.length ? tags : undefined,
        twitter: normaliseHandle(twitter) || undefined,
        github: github.trim() ? normaliseRepo(github) : undefined,
      });
      onClose();
    } catch {
      // Parent surfaces the error toast; keep the modal open so the user can retry.
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[9998] flex justify-center items-start md:items-center p-2 md:p-4 backdrop-blur-sm overflow-y-auto"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-background-card rounded-2xl shadow-2xl w-full max-w-2xl my-auto relative animate-fade-in-up flex flex-col max-h-[96vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Submit a launch"
      >
        {/* Header + stepper */}
        <div className="px-5 sm:px-7 pt-5 pb-4 border-b border-border-default">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Submit a launch</h2>
              <p className="text-xs text-text-secondary mt-0.5">{STEPS[step].hint}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <React.Fragment key={s.key}>
                  <button
                    type="button"
                    onClick={() => (i < step ? setStep(i) : goNext())}
                    className={`flex items-center gap-2 text-xs font-semibold transition-colors ${
                      active ? 'text-text-primary' : done ? 'text-text-secondary hover:text-text-primary' : 'text-text-tertiary'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${
                        active
                          ? 'bg-inverse text-inverse-ink border-transparent'
                          : done
                          ? 'bg-background-active text-text-primary border-transparent'
                          : 'border-border-strong'
                      }`}
                    >
                      {done ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className={`flex-1 h-px ${i < step ? 'bg-border-strong' : 'bg-border-default'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-7 py-5 space-y-5 overflow-y-auto">
          {step === 0 && (
            <>
              {attempted[0] && !stepValid(0) && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-base-red/10 border border-base-red/30 text-xs text-base-red">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Fill in the fields marked with <span className="font-bold">*</span> to continue.
                </div>
              )}

              <div>
                <Label required right={<Counter value={name} max={NAME_MAX} />}>Product name</Label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                  className={show('name') ? fieldBad : fieldOk}
                  placeholder="e.g., Lusty Finance"
                  autoFocus
                />
                <FieldError message={show('name')} />
              </div>

              <div>
                <Label required right={<Counter value={tagline} max={TAGLINE_MAX} />}>Tagline</Label>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX))}
                  className={show('tagline') ? fieldBad : fieldOk}
                  placeholder="Covered-call yield vaults on Stellar"
                />
                <FieldError message={show('tagline')} />
                <p className="mt-1.5 text-xs text-text-tertiary">One sentence, no marketing fluff — what does it actually do?</p>
              </div>

              <div>
                <Label required>Link</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
                    </svg>
                  </span>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onBlur={() => url.trim() && setUrl(normaliseUrl(url))}
                    className={`${show('url') ? fieldBad : fieldOk} pl-10`}
                    placeholder="yourproduct.com"
                  />
                </div>
                <FieldError message={show('url')} />
              </div>

              <div>
                <Label optional>Logo</Label>
                <div className="flex items-start gap-4">
                  {/* Drop zone / picker — always a perfect square */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      handleLogoFile(e.dataTransfer.files?.[0]);
                    }}
                    className={`group relative w-24 h-24 aspect-square flex-shrink-0 rounded-xl overflow-hidden border-2 border-dashed flex items-center justify-center transition-colors ${
                      dragging ? 'border-border-strong bg-background-active' : 'border-border-default bg-background-hover hover:border-border-strong'
                    }`}
                    aria-label="Upload a logo"
                  >
                    {logoBusy ? (
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-text-secondary" />
                    ) : logoUrl ? (
                      <>
                        <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                        <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                          Change
                        </span>
                      </>
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-text-tertiary">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                        </svg>
                        <span className="text-[11px] font-medium">Upload</span>
                      </span>
                    )}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLogoFile(e.target.files?.[0])}
                  />

                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-xs text-text-secondary">Drag an image in or click the square to pick one.</p>
                    <p className="mt-1 text-xs text-text-tertiary">PNG, JPG or WebP · up to 5MB · cropped to a square automatically.</p>

                    <div className="mt-2.5 flex items-center gap-3 text-xs">
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogoUrl('');
                            setLogoError('');
                          }}
                          className="font-semibold text-text-secondary hover:text-text-primary transition-colors"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setLogoLinkMode((v) => !v)}
                        className="font-semibold text-text-secondary hover:text-text-primary transition-colors"
                      >
                        {logoLinkMode ? 'Hide link field' : 'Use a link instead'}
                      </button>
                    </div>

                    {logoLinkMode && (
                      <input
                        value={logoUrl.startsWith('data:') ? '' : logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        onBlur={() => {
                          const v = logoUrl.trim();
                          if (v && !v.startsWith('data:')) setLogoUrl(normaliseUrl(v));
                        }}
                        className={`${show('logoUrl') ? fieldBad : fieldOk} mt-2.5`}
                        placeholder="https://…/logo.png"
                      />
                    )}
                  </div>
                </div>
                <FieldError message={logoError || show('logoUrl')} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {attempted[1] && !stepValid(1) && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-base-red/10 border border-base-red/30 text-xs text-base-red">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Fill in the fields marked with <span className="font-bold">*</span> to continue.
                </div>
              )}

              <div>
                <Label>Category</Label>
                <div className="flex flex-wrap gap-2">
                  {LAUNCH_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        category === c
                          ? 'bg-inverse text-inverse-ink'
                          : 'bg-background-hover text-text-secondary hover:bg-background-active'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label required>Network</Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {NETWORKS.map((n) => {
                    const active = network === n.key;
                    return (
                      <button
                        key={n.key}
                        type="button"
                        onClick={() => setNetwork(n.key)}
                        className={`px-3.5 py-3 rounded-lg border text-left transition-colors ${
                          active
                            ? 'border-transparent bg-inverse text-inverse-ink'
                            : show('network')
                            ? 'border-base-red/60 bg-background-hover hover:border-base-red'
                            : 'border-border-default bg-background-hover hover:border-border-strong'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <span className={`w-2 h-2 rounded-full ${active ? 'bg-inverse-ink' : n.key === 'mainnet' ? 'bg-base-green' : 'bg-amber-400'}`} />
                          {n.label}
                        </span>
                        <span className={`block mt-0.5 text-xs ${active ? 'text-inverse-ink/70' : 'text-text-tertiary'}`}>{n.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <FieldError message={show('network')} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label required>X account</Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">@</span>
                    <input
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value)}
                      onBlur={() => twitter.trim() && setTwitter(normaliseHandle(twitter))}
                      className={`${show('twitter') ? fieldBad : fieldOk} pl-8`}
                      placeholder="yourproduct"
                    />
                  </div>
                  <FieldError message={show('twitter')} />
                </div>

                <div>
                  <Label optional>GitHub repo</Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.2 1.9 1.2 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17.3 4.6 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 .3z" />
                      </svg>
                    </span>
                    <input
                      value={github}
                      onChange={(e) => setGithub(e.target.value)}
                      onBlur={() => github.trim() && setGithub(normaliseRepo(github))}
                      className={`${show('github') ? fieldBad : fieldOk} pl-10`}
                      placeholder="owner/repo"
                    />
                  </div>
                  <FieldError message={show('github')} />
                </div>
              </div>

              <div>
                <Label optional right={<Counter value={description} max={DESCRIPTION_MAX} />}>Description</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  rows={5}
                  className={`${fieldOk} resize-none leading-relaxed`}
                  placeholder={'What problem does it solve?\nWho is it for?\nWhat is live today vs. coming next?'}
                />
              </div>

              <div>
                <Label optional right={<span className="text-[11px] text-text-tertiary tabular-nums">{tags.length}/{MAX_TAGS}</span>}>
                  Tags
                </Label>
                <div className="flex flex-wrap items-center gap-2 px-2 py-2 bg-background-hover border border-border-default rounded-lg focus-within:border-border-strong transition-colors">
                  {tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-background-card text-xs font-medium text-text-secondary">
                      {t}
                      <button
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                        aria-label={`Remove ${t}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  {tags.length < MAX_TAGS && (
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addTag();
                        } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                          setTags((prev) => prev.slice(0, -1));
                        }
                      }}
                      onBlur={addTag}
                      className="flex-1 min-w-[120px] bg-transparent px-1.5 py-1 text-sm text-text-primary placeholder-text-tertiary focus:outline-none"
                      placeholder={tags.length ? 'Add another…' : 'soroban, yield, testnet'}
                    />
                  )}
                </div>
                <p className="mt-1.5 text-xs text-text-tertiary">Press Enter after each tag. Up to {MAX_TAGS}.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Preview</p>
                <div className="bg-background-body rounded-2xl border border-border-default p-4 sm:p-5">
                  <div className="flex items-start gap-3.5">
                    <LogoPreview url={logoUrl} name={name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-text-primary truncate">{name.trim() || 'Your product'}</h3>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-background-hover text-text-secondary">{category}</span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            network === 'testnet'
                              ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                              : 'border-base-green/30 bg-base-green/10 text-base-green'
                          }`}
                        >
                          {network === 'testnet' ? 'Testnet' : 'Mainnet'}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary mt-0.5">{tagline.trim() || 'Your tagline goes here'}</p>
                      {hostOf(url) && <p className="text-xs text-text-tertiary mt-1">{hostOf(url)}</p>}
                    </div>
                    <div className="w-14 h-14 rounded-xl border border-border-default bg-background-card flex flex-col items-center justify-center flex-shrink-0 text-text-primary">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                      <span className="text-sm font-bold tabular-nums mt-0.5">0</span>
                    </div>
                  </div>
                  {description.trim() && (
                    <p className="mt-3 text-sm text-text-secondary leading-relaxed whitespace-pre-line line-clamp-4">{description.trim()}</p>
                  )}
                  {tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-background-hover text-text-tertiary">#{t}</span>
                      ))}
                    </div>
                  )}
                  {(normaliseHandle(twitter) || github.trim()) && (
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-text-tertiary">
                      {normaliseHandle(twitter) && <span>@{normaliseHandle(twitter)}</span>}
                      {github.trim() && <span className="truncate">{normaliseRepo(github).replace('https://github.com/', 'github.com/')}</span>}
                    </div>
                  )}
                </div>
              </div>

              <ul className="space-y-2 text-xs text-text-secondary">
                {[
                  'Your launch goes live immediately and starts at zero stake power.',
                  'Backers vote on-chain; each vote carries their stake power and never spends their points.',
                  'Submit products you genuinely want the community to see — duplicates and spam get hidden.',
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-text-tertiary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {line}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 sm:px-7 py-4 border-t border-border-default">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            disabled={submitting}
            className="px-4 py-2.5 rounded-lg bg-background-hover hover:bg-background-active text-text-secondary text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          <span className="flex-1 text-xs text-text-tertiary hidden sm:block">
            Step {step + 1} of {STEPS.length}
          </span>

          {step < STEPS.length - 1 ? (
            <button
              onClick={goNext}
              className="px-5 py-2.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!allValid || submitting}
              className="px-5 py-2.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />}
              {submitting ? 'Publishing…' : 'Publish launch'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmitLaunchModal;
