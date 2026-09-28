import '../popover/overlay.test-utils';
import { readFileSync } from 'node:fs';

import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
import * as C from './index';
jest.mock('@rn-primitives/alert-dialog', () => {
	const Context = React.createContext({ open: false, onOpenChange: (_open: boolean) => {} });
	function Part(props: ViewProps) {
		return React.useContext(Context).open ? <View {...props} /> : null;
	}

	return {
		Root: ({
			children,
			defaultOpen = false,
		}: {
			children: React.ReactNode;
			defaultOpen?: boolean;
		}) => {
			const [open, onOpenChange] = React.useState(defaultOpen);
			return <Context.Provider value={{ open, onOpenChange }}>{children}</Context.Provider>;
		},
		useRootContext: () => React.useContext(Context),
		...Object.fromEntries(
			'Portal Overlay Content Title Description Trigger Action Cancel'
				.split(' ')
				.map((name) => [name, Part])
		),
	};
});
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
function Confirm({ phone = false, onCancel = () => {} }) {
	return (
		<DeviceScope phone={phone}>
			<C.AlertDialog defaultOpen>
				<C.AlertDialogContent inline testID="panel">
					<C.AlertDialogTitle>Delete printer?</C.AlertDialogTitle>
					<C.AlertDialogDescription>Remove it.</C.AlertDialogDescription>
					<C.AlertDialogFooter testID="footer">
						<C.AlertDialogCancel testID="cancel" onPress={onCancel}>
							Cancel
						</C.AlertDialogCancel>
					</C.AlertDialogFooter>
				</C.AlertDialogContent>
			</C.AlertDialog>
		</DeviceScope>
	);
}
it('renders the flat centered confirm above other panels', () => {
	render(<Confirm />);
	expect(screen.getByTestId('panel')).toHaveClass('max-w-105 rounded-lg z-70');
	expect(screen.getByTestId('panel').className).not.toContain('shadow');
	expect(screen.getByTestId('panel-scrim')).toHaveClass('bg-scrim z-70');
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/Platform|duration-|black\//);
});
it('renders the phone confirm and footer hairline', () => {
	render(<Confirm phone />);
	expect(screen.getByTestId('panel')).toHaveClass('w-full rounded-t-2xl web:animate-sheet-in');
	expect(screen.getByTestId('footer')).toHaveClass('border-t');
});
it('calls the user cancel handler before dismissing', () => {
	const onCancel = jest.fn(() => expect(screen.getByTestId('panel')).toBeInTheDocument());
	render(<Confirm onCancel={onCancel} />);
	fireEvent.click(screen.getByTestId('cancel'));
	expect(onCancel).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('panel')).toBeNull();
});
it('allows a footer outside the shell', () => {
	render(<C.AlertDialogFooter testID="footer" />);
	expect(screen.getByTestId('footer')).not.toHaveClass('border-t');
});
