/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { PriceKeypad } from './index';

// The classes are what is under test, and react-native-web keeps them off the DOM: the
// trigger and the display row render as plain elements carrying their className.
jest.mock('react-native', () => ({
	View: ({ className, children }: { className?: string; children?: React.ReactNode }) => (
		<div className={className}>{children}</div>
	),
}));
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
const renderKeypad = (field?: boolean) =>
	render(
		<PriceKeypad
			testID="price"
			value={10}
			field={field}
			format={String}
			labels={labels}
			onChange={jest.fn()}
		/>
	);
const displayRow = () => screen.getByTestId('price-keypad-value').parentElement!;

it("a field rests outlined with the Input's padding, its display row inset to match", () => {
	renderKeypad(true);
	const trigger = screen.getByTestId('price');
	expect(trigger.getAttribute('data-variant')).toBe('outline');
	expect(trigger.className).toContain('px-3');
	expect(trigger.querySelector('span')!.className).toContain('font-normal');
	expect(displayRow().className).toContain('px-3');
});

it('a bare price rests as ghost text, the tint past it, its display row inset as little', () => {
	renderKeypad();
	const trigger = screen.getByTestId('price');
	expect(trigger.getAttribute('data-variant')).toBe('ghost');
	expect(trigger.className).toContain('-mx-1');
	expect(displayRow().className).toContain('px-1');
	expect(displayRow().className).not.toContain('px-3');
});
