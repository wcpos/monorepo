/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

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
	return { View: Box };
});
jest.mock('../pressable-surface', () => ({
	PressableSurface: ({ className, testID, children }: Record<string, any>) => (
		<div className={className} data-testid={testID}>
			{children}
		</div>
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
	Text: ({
		testID,
		className,
		children,
	}: {
		testID?: string;
		className?: string;
		children?: React.ReactNode;
	}) => (
		<span className={className} data-testid={testID}>
			{children}
		</span>
	),
}));
jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('../lib/overlay', () => ({ useOverlayPresentation: () => 'anchored' }));
// The display row drawn open beside its trigger; its open and close are the test's to drive.
let mockOpenChange: (open: boolean) => void;
jest.mock('../grow-keypad', () => ({
	closingRows: () => [],
	GrowKeypad: ({
		rows,
		children,
		onOpenChange,
	}: {
		rows: { display?: React.ReactNode }[][];
		children: React.ReactNode;
		onOpenChange: (open: boolean) => void;
	}) => {
		mockOpenChange = onOpenChange;
		return (
			<>
				{children}
				{rows[0][0].display}
			</>
		);
	},
}));

const labels = {
	backspace: 'Delete last digit',
	done: 'Done',
	discount: (percent: number) => `Discount (${percent}%)`,
	discountKey: (percent: number) => `−${percent}%`,
};
const renderKeypad = (
	props: { rest?: 'text' | 'field' | 'key'; invalid?: boolean; value?: number } = {}
) =>
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
	renderKeypad({ rest: 'field' });
	const trigger = screen.getByTestId('price');
	expect(trigger.className).toContain(fieldBox({ state: 'rest' }));
	expect(trigger.className).toContain('px-3');
	// The outline Button's pressed wash, written as Button writes it.
	expect(trigger.className).toContain('active:bg-muted');
	expect(displayRow().className).toContain('px-3');
});

it('an invalid field draws the field box in its invalid state', () => {
	renderKeypad({ rest: 'field', invalid: true });
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

describe('a key (the Quick Discounts setting) rests as the quick key the cashier sees', () => {
	it('reads the key in primary ink, filling its cell, its display row inset as a field', () => {
		renderKeypad({ rest: 'key' });
		const trigger = screen.getByTestId('price');
		expect(trigger.className).toContain('h-full w-full');
		expect(trigger.className).not.toContain('bg-primary');
		expect(trigger.textContent).toBe('−10%');
		expect(trigger.querySelector('span')!.className).toMatch(/\btext-primary(\s|$)/);
		expect(displayRow().className).toContain('px-3');
	});

	it('a blank slot rests as a muted –', () => {
		renderKeypad({ rest: 'key', value: undefined });
		const trigger = screen.getByTestId('price');
		expect(trigger.textContent).toBe('–');
		expect(trigger.querySelector('span')!.className).toContain('text-muted-foreground');
	});

	it('is lit while its keypad is open, a blank one too, and goes back to rest on close', () => {
		renderKeypad({ rest: 'key', value: undefined });
		const trigger = () => screen.getByTestId('price');
		act(() => mockOpenChange(true));
		expect(trigger().className).toContain('bg-primary');
		expect(trigger().querySelector('span')!.className).toContain('text-primary-foreground');
		expect(trigger().querySelector('span')!.className).not.toContain('text-muted-foreground');
		act(() => mockOpenChange(false));
		expect(trigger().className).not.toContain('bg-primary');
	});
});
