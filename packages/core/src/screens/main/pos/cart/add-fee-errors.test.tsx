/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { AddFee } from './add-fee';

const mockFee = jest.fn();

// The real form and the real FormErrors; only the dialog shell and the field widgets are stubbed,
// so Add submits the default zero amount and the banner reads the zod refusal.
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({ intent }: { intent: { onPress: () => void; testID: string } }) => (
		<button data-testid={intent.testID} onClick={intent.onPress} />
	),
	useDialog: () => ({ close: jest.fn() }),
}));
jest.mock('@wcpos/components/form', () => ({
	Form: jest.requireActual('react-hook-form').FormProvider,
	FormField: () => null,
	FormInput: () => null,
	FormItem: () => null,
	FormSwitch: () => null,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/property-row', () => ({
	PropertyList: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PropertyRow: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({ title, children }: React.PropsWithChildren<{ title?: string }>) => (
		<div data-testid="form-errors">
			{title}
			{children}
		</div>
	),
}));
jest.mock('../../components/amount-field', () => ({ FormAmountField: () => null }));
jest.mock('../../components/amount-unit-toggle', () => ({ AmountUnitToggle: () => null }));
jest.mock('../../components/tax-select', () => ({ TaxSelect: () => null }));
jest.mock('../hooks/use-add-fee', () => ({ useAddFee: () => ({ addFee: mockFee }) }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));

// Climb wording batch W9. Revert: render <FormErrors /> without labels in add-fee.tsx and the
// banner names the field by its path, "amount".
it('the errors banner names the fee field "Amount", not its path', async () => {
	render(<AddFee />);
	fireEvent.click(screen.getByTestId('add-to-cart-submit'));
	const banner = await screen.findByTestId('form-errors');
	expect(banner.textContent).toContain('• Amount: Enter an amount greater than zero');
	expect(banner.textContent).not.toContain('amount:');
	expect(mockFee).not.toHaveBeenCalled();
});
