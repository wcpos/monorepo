import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SnackbarList } from './snackbar-list';

export interface SnackbarContext {
	add: (options: import('./snackbar').SnackbarProps) => void;
}

export const SnackbarContext = React.createContext<SnackbarContext>(
	undefined as unknown as SnackbarContext
);

export interface SnackbarProviderProps {
	children: React.ReactNode;
}

export const SnackbarProvider: React.FC<SnackbarProviderProps> = ({ children }) => {
	const ref = React.useRef<typeof SnackbarList>(null);

	const add = React.useCallback<SnackbarContext['add']>((options) => {
		ref?.current?.add(options);
	}, []);

	return (
		<SnackbarContext.Provider value={{ add }}>
			{children}
			<View
				style={[
					StyleSheet.absoluteFill,
					{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start' },
					{ padding: '30px' },
				]}
				pointerEvents="none"
			>
				<SnackbarList ref={ref} />
			</View>
		</SnackbarContext.Provider>
	);
};
