import * as React from 'react';

import { DEFAULT_ICON_SET, type IconSetId } from './sets';

export const IconSetContext = React.createContext<IconSetId>(DEFAULT_ICON_SET);

export function IconSetProvider({ set, children }: { set: IconSetId; children: React.ReactNode }) {
	return <IconSetContext.Provider value={set}>{children}</IconSetContext.Provider>;
}

export function useIconSet() {
	return React.useContext(IconSetContext);
}
