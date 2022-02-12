import * as React from 'react';
import { Snackbar } from './snackbar';

export const useSnackbar = () => {
	const ref = React.useRef<typeof Snackbar>(null);

	const close = React.useCallback(() => {
		ref.current?.close();
	}, []);

	const open = React.useCallback(() => {
		ref.current?.open();
	}, []);

	return { ref, open, close };
};
