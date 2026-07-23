// Shared task catalog — imported by both the client (to render the Tasks page)
// and the trusted server endpoint (api/_points.ts, to award the correct amount).
// Keep this a PURE data module: no env, no SDK, no Firebase — so it is safe to
// bundle into the serverless function as well as the browser.

export type TaskType = 'onchain' | 'visit' | 'link';

export interface TaskDef {
  id: string;
  title: string;
  description: string;
  points: number;
  type: TaskType;
  cta: string;
  /** Internal route to open for a `visit` task. */
  route?: string;
  /** External URL to open for a `link` task. */
  href?: string;
}

// Point values here are the source of truth — the server reads them from this
// same catalog, so a tampered client can never inflate a reward.
export const TASKS: TaskDef[] = [
  {
    id: 'send-tx',
    title: 'Send a Stellar transaction',
    description: 'Sign a quick, no-op on-chain action from your linked wallet. You only pay the tiny network fee.',
    points: 150,
    type: 'onchain',
    cta: 'Send transaction',
  },
  {
    id: 'visit-ecosystem',
    title: 'Explore the Stellar ecosystem',
    description: 'Open the ecosystem directory and discover projects building on Stellar.',
    points: 60,
    type: 'visit',
    route: '/ecosystem',
    cta: 'Explore projects',
  },
  {
    id: 'read-news',
    title: 'Catch up on the news',
    description: 'Check the latest crypto headlines in the news feed.',
    points: 40,
    type: 'visit',
    route: '/news',
    cta: 'Open news',
  },
  {
    id: 'post-social',
    title: 'Join the conversation',
    description: 'Head to the social feed and share a take with the community.',
    points: 40,
    type: 'visit',
    route: '/social',
    cta: 'Open feed',
  },
  {
    id: 'follow-x',
    title: 'Follow Starcast on X',
    description: 'Stay in the loop with announcements and market drops.',
    points: 50,
    type: 'link',
    href: 'https://x.com/starcast',
    cta: 'Follow on X',
  },
];

export const getTask = (id: string): TaskDef | undefined => TASKS.find((t) => t.id === id);
