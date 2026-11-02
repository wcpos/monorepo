import * as React from 'react';

/**
 * The context object alone, split out of `provider.tsx` so consumers can reach it
 * without pulling the provider in behind it. The provider imports the REST HTTP
 * client, which imports the netinfo-backed online-status hook — a module graph no
 * consumer of the *value* needs, and one that made `useCartConfig` (pure settings
 * assembly) drag a native module into every suite that touched the cart.
 */
export interface ExtraDataContextProps {
	extraData: import('@wcpos/query/user-db').ExtraDataSlot;
}

export const ExtraDataContext = React.createContext<ExtraDataContextProps | null>(null);
