/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { SplitView } from './split-view';
import { initialTenderState, tenderReducer } from './tender-state';
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
		variant,
	}: {
		children: React.ReactNode;
		testID?: string;
		onPress?: () => void;
		disabled?: boolean;
		variant?: string;
	}) => (
		<button data-testid={testID} data-variant={variant} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Pressable: ({
		children,
		testID,
		className,
		onPress,
		disabled,
	}: {
		children: React.ReactNode;
		testID: string;
		className: string;
		onPress: () => void;
		disabled: boolean;
	}) => (
		<button
			data-testid={testID}
			className={className}
			onClick={onPress}
			disabled={disabled}
			aria-disabled={disabled}
		>
			{children}
		</button>
	),
}));
const dispatch = jest.fn();
function Harness() {
	const [state, send] = React.useReducer(tenderReducer, {
		...initialTenderState,
		splitView: true,
		linesPaidBy: { 1: ['Card', 'SumUp'] },
	});
	return (
		<SplitView
			format={String}
			compact
			flow={{
				state,
				dispatch: (action) => {
					dispatch(action);
					send(action);
				},
				plan: state.plan,
				balanceMinor: 4600,
				paidMinor: 100,
				dp: 2,
				rows: [],
				busy: false,
				linesPaidBy: state.linesPaidBy,
				lines: [
					{ id: 1, name: 'Belt', quantity: 1, totalMinor: 1800 },
					{ id: 2, name: 'Scarf', quantity: 1, totalMinor: 2200 },
					{ id: 3, name: 'Socks', quantity: 1, totalMinor: 600 },
				],
			}}
		/>
	);
}
beforeEach(() => dispatch.mockClear());
it('offers even, amount and percent plans and the custom keypad', () => {
	render(<Harness />);
	for (const ways of [2, 3, 4, 5, 6]) {
		fireEvent.click(screen.getByTestId(`checkout-split-option-${ways}`));
		expect(dispatch).toHaveBeenLastCalledWith({
			type: 'set-plan',
			plan: { kind: 'even', ways, from: 0 },
			balanceMinor: 4600,
		});
	}
	fireEvent.click(screen.getByTestId('checkout-split-tab-amount'));
	expect(screen.queryByTestId('checkout-split-option-50')).toBeNull();
	fireEvent.click(screen.getByTestId('checkout-split-option-10'));
	expect(dispatch).toHaveBeenLastCalledWith({
		type: 'set-plan',
		plan: { kind: 'fixed', firstMinor: 1000, title: null, from: 0 },
		balanceMinor: 4600,
	});
	fireEvent.click(screen.getByTestId('checkout-split-option-custom'));
	expect(dispatch).toHaveBeenLastCalledWith({ type: 'arm-custom' });
	fireEvent.click(screen.getByTestId('checkout-split-tab-percent'));
	fireEvent.click(screen.getByTestId('checkout-split-option-25'));
	expect(dispatch).toHaveBeenLastCalledWith({
		type: 'set-plan',
		plan: { kind: 'fixed', firstMinor: 1150, title: '25 %', from: 0 },
		balanceMinor: 4600,
	});
	fireEvent.click(screen.getByTestId('checkout-split-none'));
	expect(dispatch).toHaveBeenLastCalledWith({ type: 'clear-plan', balanceMinor: 4600 });
});
it('disables paid lines and empty selection, then pays or shares the selected group', () => {
	render(<Harness />);
	fireEvent.click(screen.getByTestId('checkout-split-tab-item'));
	expect(screen.getByTestId('checkout-split-item-1').getAttribute('aria-disabled')).toBe('true');
	expect(screen.getByTestId('checkout-split-item-1').className).toContain('opacity-40');
	expect(screen.getByText('paid · Card + SumUp')).toBeTruthy();
	expect(screen.getByTestId('checkout-split-items-go').hasAttribute('disabled')).toBe(true);
	for (const ways of [1, 2, 3, 4]) {
		fireEvent.click(screen.getByTestId('checkout-split-item-2'));
		fireEvent.click(screen.getByTestId('checkout-split-item-3'));
		fireEvent.click(
			screen.getByTestId(ways === 1 ? 'checkout-split-items-go' : `checkout-split-share-${ways}`)
		);
		expect(dispatch).toHaveBeenLastCalledWith({
			type: 'set-plan',
			plan: { kind: 'items', lineIds: [2, 3], firstMinor: 2800, ways, from: 0 },
			balanceMinor: 4600,
		});
	}
});
