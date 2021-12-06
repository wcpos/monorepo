import * as React from 'react';

import { Popover } from './popover';

export type TOpen = 'default' | 'top';
export type TClose = 'default' | 'alwaysOpen';

export const usePopover = () => {
	const ref = React.useRef<typeof Popover>(null);

	const close = React.useCallback(() => {
		ref.current?.close();
	}, []);

	const open = React.useCallback(() => {
		ref.current?.open();
	}, []);

	return { ref, open, close };
};
