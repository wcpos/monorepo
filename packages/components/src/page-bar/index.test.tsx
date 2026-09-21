import { readFileSync } from 'node:fs';

import * as React from 'react';
import type { TextProps, ViewProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
import { PageBar } from './index';

jest.mock('react-native', () => {
	const native = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...native,
		useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
		// RN-web drops className without the Uniwind transform; preserve it at this boundary.
		View: React.forwardRef<HTMLDivElement, ViewProps>(function MockView(
			{ testID, style, className, children },
			ref
		) {
			return (
				<div
					ref={ref}
					data-testid={testID}
					className={className}
					style={native.StyleSheet.flatten(style) as React.CSSProperties}
				>
					{children}
				</div>
			);
		}),
		Text: ({
			testID,
			numberOfLines,
			ellipsizeMode,
			className,
			children,
			'aria-hidden': ariaHidden,
		}: TextProps) => (
			<span
				className={className}
				aria-hidden={ariaHidden}
				data-testid={testID}
				data-lines={numberOfLines}
				data-ellipsis={ellipsizeMode}
			>
				{children}
			</span>
		),
	};
});

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));

it('renders title, subtitle, real status variant and controls with a safe-area outside the ctl row', () => {
	render(
		<PageBar
			testID="bar"
			title="Products"
			subtitle="· UK Store"
			status={{ label: 'Offline', variant: 'warning' }}
		>
			<button data-testid="control" />
		</PageBar>
	);
	expect(screen.getByTestId('bar-title')).toHaveTextContent('Products');
	expect(screen.getByTestId('bar-subtitle')).toHaveTextContent('· UK Store');
	const status = screen.getByTestId('bar-status');
	expect(status).toHaveTextContent('Offline');
	expect(status.firstElementChild).toHaveClass('text-warning');
	expect(screen.getByTestId('bar')).toHaveStyle({ paddingTop: '24px' });
	expect(screen.getByTestId('bar').firstElementChild).toHaveClass('h-ctl');
	expect(screen.getByTestId('control')).toBeInTheDocument();
	expect(screen.getByTestId('bar-title')).toHaveAttribute('data-lines', '1');
	expect(screen.getByTestId('bar-title')).toHaveAttribute('data-ellipsis', 'tail');
});

it('phone scope shows the named menu and fires its callback', () => {
	const onPress = jest.fn();
	render(
		<DeviceScope phone>
			<PageBar testID="bar" title="Products" onMenu={{ label: 'Menu', onPress }} />
		</DeviceScope>
	);
	// An icon-only control is unreachable by name without this; the caller translates it.
	expect(screen.getByTestId('bar-menu')).toHaveAttribute('aria-label', 'Menu');
	fireEvent.click(screen.getByTestId('bar-menu'));
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('phone back composes Breadcrumb and wins over the menu', () => {
	const onPress = jest.fn();
	render(
		<DeviceScope phone>
			<PageBar
				testID="bar"
				title="Printers"
				onMenu={{ label: 'Menu', onPress: jest.fn() }}
				back={{ label: 'Settings', onPress }}
			/>
		</DeviceScope>
	);
	expect(screen.queryByTestId('bar-menu')).toBeNull();
	expect(screen.getByTestId('bar-back')).toHaveTextContent('Settings');
	fireEvent.click(screen.getByTestId('bar-back-parent-0'));
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('wide window without a scope renders neither leading control', () => {
	expect(window.innerWidth).toBeGreaterThanOrEqual(640);
	render(
		<PageBar
			testID="bar"
			title="Products"
			onMenu={{ label: 'Menu', onPress: jest.fn() }}
			back={{ label: 'Settings', onPress: jest.fn() }}
		/>
	);
	expect(screen.queryByTestId('bar-menu')).toBeNull();
	expect(screen.queryByTestId('bar-back')).toBeNull();
});

it('honours explicit child IDs without manufacturing undefined IDs', () => {
	render(
		<DeviceScope phone>
			<PageBar
				title="Printers"
				status={{ label: 'Offline', testID: 'status' }}
				back={{ label: 'Settings', onPress: jest.fn(), testID: 'back' }}
			/>
		</DeviceScope>
	);
	expect(screen.getByTestId('status')).toHaveTextContent('Offline');
	expect(screen.getByTestId('back')).toHaveTextContent('Settings');
	expect(document.querySelector('[data-testid^="undefined-"]')).toBeNull();
});

it('owns no system bars, theme lookup or store title suffix', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(
		/SystemBars|useTheme|storeName/
	);
});
