// Market filter categories. 'Perp' is a special category: instead of a grid of
// user-created markets it renders the live long/short price game (PerpMarkets),
// so it is intentionally excluded from the create-market dropdown.
export const CATEGORIES = ['All', 'Perp', 'Crypto', 'Ecosystem', 'Other'];

// Categories a user can actually create a prediction market in.
export const CREATABLE_CATEGORIES = CATEGORIES.filter((c) => c !== 'All' && c !== 'Perp');
