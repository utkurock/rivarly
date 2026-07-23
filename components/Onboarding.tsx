import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'starcast:onboarded:v1';

interface Step {
  title: string;
  body: string;
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Starcast',
    body: 'Predict real-world markets, follow the social feed, and stay on top of crypto news — all on Stellar. Connect a wallet whenever you are ready.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M14.828 14.828 21 21" /><path d="M21 16v5h-5" /><path d="m21 3-9 9-4-4-6 6" /><path d="M21 8V3h-5" />
      </svg>
    ),
  },
  {
    title: 'Make your call',
    body: 'Back YES or NO on any market, share a take on the social feed, and explore the projects building across the Stellar ecosystem.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  {
    title: 'Earn points daily',
    body: 'Claim your daily reward, keep a streak going, and complete tasks to rack up points and climb the leaderboard.',
    icon: (
      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
      </svg>
    ),
  },
];

// First-run onboarding: a 3-step intro shown once, then remembered in
// localStorage. Self-contained — mount once near the app root.
const Onboarding: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#141519] rounded-2xl border border-[#262830] shadow-2xl overflow-hidden animate-onb-in">
        {/* Accent header */}
        <div className="relative h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />

        <div className="p-6 md:p-7">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6d6e77]">
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              onClick={finish}
              className="text-xs font-medium text-[#6d6e77] hover:text-[#ececee] transition-colors"
            >
              Skip
            </button>
          </div>

          <div className="mt-5 w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            {s.icon}
          </div>

          <h2 className="mt-5 text-xl font-bold text-[#ececee]">{s.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#9b9ca4]">{s.body}</p>

          {/* Progress dots */}
          <div className="mt-6 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-white' : 'w-1.5 bg-[#33353d]'}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((v) => v - 1)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#9b9ca4] hover:text-[#ececee] hover:bg-[#1c1d22] transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep((v) => v + 1))}
              className="flex-1 py-2.5 rounded-xl bg-white hover:bg-gray-200 text-[#0b0c0e] text-sm font-semibold transition-colors"
            >
              {isLast ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes onb-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-onb-in { animation: onb-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default Onboarding;
