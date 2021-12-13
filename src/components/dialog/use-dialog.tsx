import * as React from 'react';
import { Dialog } from './dialog';

export const useDialog = () => {
	const ref = React.useRef<typeof Dialog>(null);

	const close = React.useCallback(() => {
		ref.current?.close();
	}, []);

	const open = React.useCallback(() => {
		ref.current?.open();
	}, []);

	return { ref, open, close };
};
