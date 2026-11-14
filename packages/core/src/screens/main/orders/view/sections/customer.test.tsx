/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { createTestT } from '../../../../../../jest/translate';
import { CustomerSection } from './customer';

const mockT = createTestT();

type Props = React.PropsWithChildren<{ testID?: string }>;
function mockDiv({ children, testID }: Props) {
	return <div data-testid={testID}>{children}</div>;
}
jest.mock('react-native', () => ({ View: mockDiv }));
jest.mock('@wcpos/components/text', () => ({ Text: mockDiv }));
jest.mock('@wcpos/components/format', () => ({
	FormatAddress: ({ address }: { address: Record<string, string> }) => (
		<address>{address.address_1}</address>
	),
}));
jest.mock('./_section', () => ({
	Section: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => mockT }));
// A value import of lib/tax-id drags @wcpos/database (ESM uuid) into the suite; the labels are not under test.
jest.mock('../../../../../lib/tax-id', () => ({
	suggestTaxIdTypes: () => [],
	splitTaxIdTypesForCountry: () => ({ suggested: [], rest: [] }),
	useTaxIdLabels: () => ({}),
}));
jest.mock('../../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Ada Lovelace' }),
}));
jest.mock('../../../components/user-avatar/customer-avatar', () => ({
	CustomerAvatar: () => null,
}));

const order = (billing: Record<string, string>, shipping: Record<string, string> = {}) =>
	({ customer_id: 7, billing, shipping, tax_ids: [] }) as never;

const addresses = () => screen.getByTestId('order-modal-addresses').querySelectorAll('address');

describe('CustomerSection', () => {
	it('shows the billing address in full with nothing to open (Paul, 2026-10-26)', () => {
		render(<CustomerSection order={order({ first_name: 'Ada', address_1: '1 Analytical Row' })} />);
		expect(screen.getByTestId('order-modal-addresses').textContent).toContain('1 Analytical Row');
		expect(screen.queryByTestId('order-modal-addresses-trigger')).toBeNull();
	});

	it('shows no addresses block when the order has none', () => {
		render(<CustomerSection order={order({ email: 'ada@example.com' })} />);
		expect(screen.queryByTestId('order-modal-addresses')).toBeNull();
	});

	it('shows the shipping address only when it differs from billing', () => {
		const billing = { first_name: 'Ada', address_1: '1 Analytical Row', city: 'London' };
		const { unmount } = render(<CustomerSection order={order(billing, { ...billing })} />);
		expect(addresses().length).toBe(1);
		unmount();
		render(
			<CustomerSection
				order={order(billing, { first_name: 'Ada', address_1: '2 Difference Engine' })}
			/>
		);
		expect(addresses().length).toBe(2);
	});
});
