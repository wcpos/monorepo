import * as React from 'react';

export { default } from './table';

export const RedrawContext = React.createContext<undefined | (() => void)>(undefined);

export function useTableRedraw() {
	return React.useContext(RedrawContext);
}
