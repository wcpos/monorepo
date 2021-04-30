import * as React from 'react';
import wrap from 'lodash/wrap';
import { View } from 'react-native';
import { SnackbarProps, Snackbar } from './snackbar';
import * as Styled from './styles';

export type SnackbarOptions = SnackbarProps;

export interface SnackbarContext {
	show: (options: SnackbarOptions) => void;
}

export const SnackbarContext = React.createContext<SnackbarContext>(
	(undefined as unknown) as SnackbarContext
);

export interface SnackbarProviderProps {
	children: React.ReactNode;
}

export const SnackbarProvider = ({ children }: SnackbarProviderProps) => {
	const [snackbarOptions, setSnackbarOptions] = React.useState<SnackbarOptions>();

	const show = React.useCallback<SnackbarContext['show']>(
		(options) => {
			// Wrap the onDismiss callback to unmount the component on dismiss
			options.onDismiss = wrap(options.onDismiss, (origOnDismiss) => {
				origOnDismiss?.();
				setSnackbarOptions(undefined); // Unmount the Snackbar
			}) as () => void;

			setSnackbarOptions(options);
		},
		[setSnackbarOptions]
	);

	return (
		<SnackbarContext.Provider value={{ show }}>
			{/* Wrapper for Snackbar which is necessary to make sure the Snackbar is displayed within AppProvider bounds */}
			<Styled.Provider pointerEvents="auto">
				{children}
				{snackbarOptions ? <Snackbar key={snackbarOptions.message} {...snackbarOptions} /> : null}
			</Styled.Provider>
		</SnackbarContext.Provider>
	);
};
