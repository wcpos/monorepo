import * as React from 'react';

export interface PopoverContext {
	requestClose: () => void;
}

/**
 * Context providing ability to Popover Items to dismiss the Popover.
 */
// @ts-ignore
export const PopoverContext = React.createContext<PopoverContext>({ requestClose: () => {} });
