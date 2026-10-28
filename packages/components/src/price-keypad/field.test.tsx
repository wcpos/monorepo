/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { fieldBox } from '../field-box';
import { PriceKeypad } from './index';

// The classes are what is under test, and react-native-web keeps them off the DOM: the
// trigger and the display row render as plain elements carrying their className.
jest.mock('react-native', () => {
	function Box({ className, testID, children }: Record<string, any>) {
		return (
			<div className={className} data-testid={testID}>
				{children}
			</div>
		);
	}
	return { View: Box, Pressable: Box };
});
jest.mock('../button', () => ({
	Button: ({
		className,
		variant,
		testID,
		children,
	}: {
		className?: string;
		variant?: string;
		testID?: string;
		children?: React.ReactNode;
	}) => (
		<button className={className} data-variant={variant} data-testid={testID}>
			{children}
		</button>
	),
	ButtonText: ({ className, children }: { className?: string; children?: React.ReactNode }) => (
		<span className={className}>{children}</span>
	),
}));
jest.mock('../text', () => ({
	Text: ({ testID, children }: { testID?: string; children?: React.ReactNode }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('../lib/overlay', () => ({ useOverlayPresentation: () => 'anchored' }));
// The display row drawn open beside its trigger.
jest.mock('../grow-keypad', () => ({
	DIGIT_ROWS: [],
	closingRows: () => [],
	GrowKeypad: ({
		rows,
		children,
	}: {
		rows: { display?: React.ReactNode }[][];
		children: React.ReactNode;
	}) => (
		<>
			{children}
			{rows[0][0].display}
		</>
	),
}));

const labels = {
	backspace: 'Delete last digit',
	done: 'Done',
	discount: (percent: number) => `Discount (${percent}%)`,
	discountKey: (percent: number) => `−${percent}%`,
};
const renderKeypad = (props: { field?: boolean; invalid?: boolean } = {}) =>
	render(
		<PriceKeypad
			testID="price"
			value={10}
			format={String}
			labels={labels}
			onChange={jest.fn()}
			{...props}
		/>
	);
const displayRow = () => screen.getByTestId('price-keypad-value').parentElement!;

it("a field rests as the field box with the Input's padding, its display row inset to match", () => {
	renderKeypad({ field: true });
	const trigger = screen.getByTestId('price');
	expect(trigger.className).toContain(fieldBox({ state: 'rest' }));
	expect(trigger.className).toContain('px-3');
	expect(trigger.className).toContain('active:bg-muted');
	expect(displayRow().className).toContain('px-3');
});

it('an invalid field draws the field box in its invalid state', () => {
	renderKeypad({ field: true, invalid: true });
	expect(screen.getByTestId('price').className).toContain(fieldBox({ state: 'invalid' }));
});

it('a bare price rests as ghost text, the tint past it, its display row inset as little', () => {
	renderKeypad();
	const trigger = screen.getByTestId('price');
	expect(trigger.getAttribute('data-variant')).toBe('ghost');
	expect(trigger.className).toContain('-mx-1');
	expect(displayRow().className).toContain('px-1');
	expect(displayRow().className).not.toContain('px-3');
});
