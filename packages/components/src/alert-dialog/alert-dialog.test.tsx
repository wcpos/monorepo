import '../popover/overlay.test-utils';
import { readFileSync } from 'node:fs';

import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { fireEvent, render, screen, within } from '@testing-library/react';

import { DialogLabelsProvider } from '../dialog/labels';
import { DeviceScope } from '../lib/device';
import * as overlay from '../lib/overlay';
import * as C from './index';
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('../loader', () => ({ Loader: () => null }));
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
	Slot: ({ children, ...props }: React.PropsWithChildren) =>
		React.isValidElement(children) ? React.cloneElement(children, props) : null,
}));
jest.mock('../button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		variant,
		size,
		className,
		disabled,
	}: React.ComponentProps<typeof import('../button').Button>) => (
		<button
			data-testid={testID}
			onClick={onPress as unknown as React.MouseEventHandler}
			disabled={disabled ?? false}
			className={jest.requireActual('../button').buttonVariants({ variant, size, className })}
		>
			{typeof children === 'function' ? children({ pressed: false }) : children}
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
					<C.AlertDialogFooter
						testID="footer"
						cancel={{ testID: 'cancel', onPress: onCancel }}
						confirm={{ label: 'Delete', destructive: true }}
					/>
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
it('is a blocking confirmation whose phone sheet pads the bottom inset', () => {
	// The native answers live in the shell (`lib/overlay.native.test.tsx`); this pins the wiring.
	const Shell = overlay.OverlayShell;
	const shell = jest
		.spyOn(overlay, 'OverlayShell')
		.mockImplementation((props) => <Shell {...props} />);
	const inset = jest.spyOn(overlay, 'useSheetInset').mockReturnValue({ paddingBottom: 50 });
	// This harness's View drops `style`, so read it where the primitive Content receives it.
	const content = jest.spyOn(jest.requireMock('@rn-primitives/alert-dialog'), 'Content');
	try {
		render(<Confirm phone />);
		expect(shell).toHaveBeenLastCalledWith(expect.objectContaining({ blocking: true }), undefined);
		expect(inset).toHaveBeenLastCalledWith(16, 'bottom');
		expect(content).toHaveBeenLastCalledWith(
			expect.objectContaining({ style: [{ paddingBottom: 50 }, undefined] }),
			undefined
		);
	} finally {
		shell.mockRestore();
		inset.mockRestore();
		content.mockRestore();
	}
});
it('calls the user cancel handler before dismissing', () => {
	const onCancel = jest.fn(() => expect(screen.getByTestId('panel')).toBeInTheDocument());
	render(<Confirm onCancel={onCancel} />);
	fireEvent.click(screen.getByTestId('cancel'));
	expect(onCancel).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('panel')).toBeNull();
});
it('allows a footer outside the shell', () => {
	render(<C.AlertDialogFooter testID="footer" confirm={{ label: 'Delete' }} />);
	expect(screen.getByTestId('footer')).not.toHaveClass('border-t');
});

it.each([false, true])('slot confirm owns its loss variant (%s)', (destructive) => {
	render(
		<C.AlertDialog defaultOpen>
			<C.AlertDialogFooter confirm={{ label: 'Confirm', destructive }} />
		</C.AlertDialog>
	);
	expect(screen.getByText('Confirm')).toHaveClass(destructive ? 'bg-destructive' : 'bg-primary');
	expect(screen.getByText('Cancel')).toHaveClass('border-border', 'bg-card');
});
it.each([false, true])('orders cancel and confirm by device (%s)', (phone) => {
	render(
		<DeviceScope phone={phone}>
			<C.AlertDialog defaultOpen>
				<C.AlertDialogFooter size="lg" confirm={{ label: 'Confirm' }} />
			</C.AlertDialog>
		</DeviceScope>
	);
	expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
		phone ? ['Confirm', 'Cancel'] : ['Cancel', 'Confirm']
	);
	for (const button of screen.getAllByRole('button')) {
		expect(button).toHaveClass('h-14');
		if (phone) expect(button).toHaveClass('w-full');
	}
});
it('translated slot cancel calls its handler and dismisses', () => {
	const onPress = jest.fn();
	render(
		<DialogLabelsProvider labels={{ close: 'Close', cancel: 'Not now' }}>
			<C.AlertDialog defaultOpen>
				<C.AlertDialogContent inline testID="slot-panel">
					<C.AlertDialogTitle>Confirm</C.AlertDialogTitle>
					<C.AlertDialogFooter
						cancel={{ onPress }}
						confirm={{ label: 'Delete', destructive: true }}
					/>
				</C.AlertDialogContent>
			</C.AlertDialog>
		</DialogLabelsProvider>
	);
	fireEvent.click(screen.getByText('Not now'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('slot-panel')).toBeNull();
});
it('can omit cancel and fills a lone lg confirm', () => {
	render(<C.AlertDialogFooter cancel={false} size="lg" confirm={{ label: 'Confirm' }} />);
	expect(screen.queryByText('Cancel')).toBeNull();
	expect(screen.getByText('Confirm')).toHaveClass('flex-1');
});

it.each([false, true])(
	'places the secondary between cancel and confirm by device (%s)',
	(phone) => {
		const secondary = jest.fn();
		render(
			<DeviceScope phone={phone}>
				<C.AlertDialog defaultOpen>
					<C.AlertDialogContent inline>
						<C.AlertDialogFooter
							testID="footer"
							confirm={{ label: 'Close register' }}
							secondary={{ label: 'Sign out anyway', onPress: secondary, testID: 'secondary' }}
						/>
					</C.AlertDialogContent>
				</C.AlertDialog>
			</DeviceScope>
		);
		expect(
			within(screen.getByTestId('footer'))
				.getAllByRole('button')
				.map((b) => b.textContent)
		).toEqual(
			phone
				? ['Close register', 'Sign out anyway', 'Cancel']
				: ['Cancel', 'Sign out anyway', 'Close register']
		);
		expect(screen.getByTestId('secondary')).toHaveClass('border-border', 'bg-card');
		fireEvent.click(screen.getByTestId('secondary'));
		expect(secondary).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('footer')).toBeInTheDocument();
	}
);
