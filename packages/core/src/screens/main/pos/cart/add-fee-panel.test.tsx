/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';
import type { ScrollViewProps, ViewProps } from 'react-native';

import { render, screen } from '@testing-library/react';

import { Dialog, DialogContent } from '@wcpos/components/dialog';

import { AddFee } from './add-fee';

// Keep the actual dialog parts and shell context. Only platform primitives and unrelated
// form controls are replaced; RN-web otherwise drops the Uniwind classes under test.
function mockView({ children, className, testID }: ViewProps) {
	return (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	);
}
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: mockView,
	ScrollView: ({ children, className }: ScrollViewProps) => (
		<div data-testid="panel-body" className={className}>
			{children}
		</div>
	),
}));
jest.mock('react-native-reanimated', () => {
	const animation = { duration: () => animation, easing: () => animation };
	return {
		__esModule: true,
		default: { View: mockView },
		Keyframe: jest.fn(() => ({ duration: jest.fn() })),
		Easing: { bezier: () => 'ease' },
		...Object.fromEntries(
			[
				'FadeIn',
				'FadeOut',
				'SlideInDown',
				'SlideInLeft',
				'SlideInRight',
				'SlideOutDown',
				'SlideOutLeft',
				'SlideOutRight',
			].map((key) => [key, animation])
		),
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@wcpos/components/keyboard-controller', () => ({ KeyboardAvoidingView: mockView }));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => false }));
jest.mock('@rn-primitives/dialog', () => ({
	Root: mockView,
	Content: mockView,
	Overlay: mockView,
	Close: mockView,
	useRootContext: () => ({ open: true, onOpenChange: jest.fn() }),
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: mockView }));
jest.mock('@wcpos/components/button', () => ({ Button: mockView }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormField: () => null,
	FormInput: () => null,
	FormItem: () => null,
	FormSegmentedControl: () => null,
	FormSelect: () => null,
	FormSwitch: () => null,
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../components/amount-field', () => ({
	AmountField: () => null,
	FormAmountField: () => null,
}));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/tax-select', () => ({ TaxSelect: () => null }));
jest.mock('../../components/amount-unit-toggle', () => ({ AmountUnitToggle: () => null }));
jest.mock('../hooks/use-add-fee', () => ({ useAddFee: () => ({ addFee: jest.fn() }) }));

// Revert AddFee's dialog import to the legacy module: it reads the absent SideContext
// and defaults to center, losing both the expanding body and the footer divider.
it('a body inside a side panel flexes and its footer is pinned', () => {
	render(
		<Dialog open>
			<DialogContent side="left" inline>
				<AddFee />
			</DialogContent>
		</Dialog>
	);
	const body = screen.getByTestId('panel-body');
	const footer = screen.getByTestId('add-to-cart-submit').parentElement?.parentElement;
	expect(body).toHaveClass('flex-1');
	expect(footer).toHaveClass('border-border', 'border-t', 'pt-4');
	expect(body.nextElementSibling).toBe(footer);
});
