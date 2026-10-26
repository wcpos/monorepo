import { readFileSync } from 'node:fs';

import * as React from 'react';
import type { TextProps, ViewProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { Breadcrumb } from './index';
import { DeviceScope } from '../lib/device';

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
// SVG/Uniwind are native runtime dependencies; keep Button, Text and their contexts real.
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const parents = [
	{ label: 'Catalog', onPress: jest.fn() },
	{ label: 'Products', onPress: jest.fn() },
] as const;

it('one parent is Back and activates its callback', () => {
	render(<Breadcrumb testID="crumb" parents={[parents[1]]} />);
	const back = screen.getByTestId('crumb-parent-0');
	expect(back).toHaveTextContent('Products');
	expect(back.querySelector('[data-icon="chevronLeft"]')).toBeNull();
	expect(back).toHaveAttribute('role', 'button');
	fireEvent.click(back);
	expect(parents[1].onPress).toHaveBeenCalledTimes(1);
});

it('the regular trail separates every place with right chevrons only', () => {
	render(<Breadcrumb testID="crumb" parents={parents} here="Tote bag" />);
	expect(screen.getByTestId('crumb').querySelector('[data-icon="chevronLeft"]')).toBeNull();
	expect(screen.getByTestId('crumb').querySelectorAll('[data-icon="chevronRight"]')).toHaveLength(
		2
	);
	expect(screen.getByTestId('crumb-here')).toHaveTextContent('Tote bag');
	const label = screen.getByTestId('crumb-parent-1').querySelector('span:not([data-icon])');
	expect(label?.className).not.toMatch(/truncate|whitespace-nowrap/);
});

it('the phone shows only the immediate parent back control and the title', () => {
	render(
		<DeviceScope phone>
			<Breadcrumb testID="crumb" parents={parents} here="Tote bag" autoFocus />
		</DeviceScope>
	);
	expect(screen.queryByText('Catalog')).toBeNull();
	const back = screen.getByTestId('crumb-parent-1');
	expect(back).toHaveTextContent('Products');
	expect(back.querySelector('[data-icon="chevronLeft"]')).not.toBeNull();
	expect(screen.getByTestId('crumb').querySelector('[data-icon="chevronRight"]')).toBeNull();
	expect(screen.getByTestId('crumb-here')).toHaveTextContent('Tote bag');
	expect(document.activeElement).toBe(back);
});

it('autoFocus focuses the last parent through its ref once, not on parents changes', () => {
	const focus = jest.spyOn(HTMLElement.prototype, 'focus');
	const { rerender } = render(<Breadcrumb testID="crumb" parents={parents} autoFocus />);
	expect(focus).toHaveBeenCalledTimes(1);
	// Without preventScroll a crumb focused inside an off-stage pane scrolls the stage to it.
	expect(focus).toHaveBeenCalledWith({ preventScroll: true });
	expect(document.activeElement).toBe(screen.getByTestId('crumb-parent-1'));
	rerender(<Breadcrumb testID="crumb" parents={[parents[0]]} autoFocus />);
	expect(focus).toHaveBeenCalledTimes(1);
	focus.mockRestore();
});

it('does not focus without autoFocus and renders the trailing slot', () => {
	const focus = jest.spyOn(HTMLElement.prototype, 'focus');
	render(
		<Breadcrumb parents={[parents[0]]}>
			<span data-testid="preview" />
		</Breadcrumb>
	);
	expect(focus).not.toHaveBeenCalled();
	expect(screen.getByTestId('preview')).toBeInTheDocument();
	expect(document.querySelector('[data-testid^="undefined-"]')).toBeNull();
	focus.mockRestore();
});

it('does not constrain labels to a line count', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toContain('numberOfLines');
});

it('grows with a wrapped label and keeps every crumb at the pointer floor', () => {
	// react-native-web compiles HStack's and Pressable's classes away in this harness, so the
	// contract is read from source: a fixed row height cannot honour the wrapping contract
	// (ledger line 3), and a crumb is the phone page's back control, so it meets the floor
	// (Codex review on #2188).
	// Asserted per class, not as one string: the pre-commit formatter sorts class lists, so
	// a substring assertion on a whole list goes red on a reorder that changes nothing.
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	const root = source.match(/className=\{cn\('([^']+)'/)?.[1]?.split(' ') ?? [];
	expect(root).toContain('min-h-ctl');
	expect(root).toContain('flex-wrap');
	expect(root).not.toContain('h-ctl');
	expect(source).toContain('hitSlop={{ top: 8, bottom: 8 }}');
	expect(source).toContain('role="button"');
});
