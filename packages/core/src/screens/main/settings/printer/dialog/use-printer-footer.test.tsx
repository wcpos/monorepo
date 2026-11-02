/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';
import type { PressableProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogFooter } from '@wcpos/components/dialog';
import { DeviceScope } from '@wcpos/components/lib/device';

import { usePrinterFooter } from './use-printer-footer';

let mockPresentation = 'right';
jest.mock('@wcpos/components/lib/overlay', () => ({
	useOverlay: () => ({ presentation: mockPresentation }),
	useOverlayPresentation: () => mockPresentation,
}));
beforeEach(() => {
	mockPresentation = 'right';
});
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => <span>Loading</span> }));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
	View: ({ children, className, testID }: React.ComponentProps<'div'> & { testID?: string }) => (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	),
	Pressable: ({
		children,
		className,
		testID,
		onPress,
		disabled,
		accessibilityLabel,
		ref,
	}: PressableProps & { ref?: React.Ref<HTMLButtonElement> }) => (
		<button
			ref={ref}
			className={className}
			data-testid={testID}
			disabled={disabled ?? false}
			aria-label={accessibilityLabel}
			onClick={onPress as unknown as React.MouseEventHandler}
		>
			{typeof children === 'function' ? children({ pressed: false }) : children}
		</button>
	),
}));
jest.mock('@rn-primitives/dialog', () => {
	const Context = React.createContext((_open: boolean) => {});
	return {
		Root: ({
			children,
			onOpenChange,
		}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => (
			<Context.Provider value={onOpenChange}>{children}</Context.Provider>
		),
		Close: ({
			children,
		}: {
			children: React.ReactElement<React.ComponentProps<typeof Button>>;
		}) => {
			const change = React.useContext(Context);
			return React.cloneElement(children, {
				onPress: (event) => {
					children.props.onPress?.(event);
					change(false);
				},
			});
		},
	};
});

jest.mock('../../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../../jest/translate')>(
				'../../../../../../jest/translate'
			)
			.createTestT(),
}));

function Footer(props: Parameters<typeof usePrinterFooter>[0]) {
	return <DialogFooter {...usePrinterFooter(props)} />;
}

it('keeps printer actions leading, loading independently, and dismisses once without Save actions', () => {
	const props = {
		showOpenDrawer: true,
		testLoading: false,
		drawerLoading: false,
		onOpenDrawer: jest.fn(),
		onTestPrint: jest.fn(),
	};
	const onOpenChange = jest.fn();
	const view = (updates = {}) => (
		<DeviceScope phone={false}>
			<Dialog open onOpenChange={onOpenChange}>
				<Footer {...props} {...updates} />
			</Dialog>
		</DeviceScope>
	);
	const { rerender } = render(view());
	expect(screen.getAllByRole('button').map((button) => button.dataset.testid)).toEqual([
		'add-printer-open-drawer-button',
		'add-printer-test-button',
		'printer-dialog-close',
	]);
	const drawer = screen.getByTestId('add-printer-open-drawer-button');
	const print = screen.getByTestId('add-printer-test-button');
	const close = screen.getByTestId('printer-dialog-close');
	expect(drawer.parentElement).toBe(print.parentElement);
	expect(close.parentElement).not.toBe(print.parentElement);
	for (const button of [drawer, print, close]) {
		expect(button).toHaveClass('border-border', 'bg-card');
	}
	expect(close).toHaveTextContent('Close');
	expect(screen.queryByTestId('add-printer-save-button')).toBeNull();
	expect(screen.queryByTestId('add-printer-save-anyway-button')).toBeNull();
	fireEvent.click(drawer);
	fireEvent.click(print);
	fireEvent.click(close);
	expect(props.onOpenDrawer).toHaveBeenCalledTimes(1);
	expect(props.onTestPrint).toHaveBeenCalledTimes(1);
	expect(onOpenChange).toHaveBeenCalledTimes(1);
	expect(onOpenChange).toHaveBeenCalledWith(false);
	rerender(view({ drawerLoading: true }));
	expect(screen.getByTestId('add-printer-open-drawer-button')).toBeDisabled();
	expect(screen.getByTestId('add-printer-test-button')).not.toBeDisabled();
	rerender(view({ testLoading: true }));
	expect(screen.getByTestId('add-printer-test-button')).toBeDisabled();
	expect(screen.getByTestId('add-printer-open-drawer-button')).not.toBeDisabled();
	rerender(view({ showOpenDrawer: false }));
	expect(screen.queryByTestId('add-printer-open-drawer-button')).toBeNull();
});
