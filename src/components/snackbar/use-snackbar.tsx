import * as React from 'react';
import { SnackbarOptions, SnackbarContext } from './provider';

/**
 * Get a function for showing a Snackbar with the specified options.
 *
 * Simply call the function to show the Snackbar, which will be automatically
 * dismissed.
 *
 * @example
 * const showSnackbar = useSnackbar({ message: 'This is a Snackbar!' })
 * <Button onClick={showSnackbar}>Show Snackbar!</Button>
 */
export const useSnackbar = (
	defaultOptions?: SnackbarOptions
): ((options: SnackbarOptions) => void) => {
	const context = React.useContext(SnackbarContext);

	if (!context) {
		throw new Error(`useSnackbar must be called within SnackbarProvider`);
	}

	return React.useCallback(
		(options: SnackbarOptions) => context.add({ ...defaultOptions, ...options }),
		[context, defaultOptions]
	);
};
