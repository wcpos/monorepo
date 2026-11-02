/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { EditableAmount } from './editable-amount';

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: { payload: object }, select: (r: { payload: object }) => unknown) =>
		select(record),
}));
jest.mock('../../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: false }) }));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditCoupons: true } }),
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children }: { children: React.ReactNode }) => children,
}));
// The amount field owns places and format; the cell names the kind and writes the string.
let mockOnCommit: (value: number) => void;
jest.mock('../../components/amount-field', () => ({
	AmountField: ({ kind, onCommit }: { kind: string; onCommit: (value: number) => void }) => {
		mockOnCommit = onCommit;
		return <span data-testid="amount" data-kind={kind} />;
	},
}));

function renderAmount(discount_type: string, amount: string) {
	const commit = jest.fn();
	const record = { payload: { discount_type, amount } };
	const props = {
		row: { original: { record } },
		column: { id: 'amount' },
		table: { options: { meta: { commit } } },
	} as unknown as Parameters<typeof EditableAmount>[0];
	render(<EditableAmount {...props} />);
	return { amount: screen.getByTestId('amount'), commit };
}

it('a percentage coupon is a percent amount, written back as WooCommerce text', () => {
	const { amount, commit } = renderAmount('percent', '12.5');
	expect(amount.getAttribute('data-kind')).toBe('percent');
	mockOnCommit(12.75);
	expect(commit).toHaveBeenCalledWith(expect.objectContaining({ changes: { amount: '12.75' } }));
});

it.each(['fixed_cart', 'fixed_product'])('a %s coupon is money', (type) => {
	expect(renderAmount(type, '10').amount.getAttribute('data-kind')).toBe('money');
});
