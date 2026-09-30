/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { CustomerRow } from './row';

jest.mock('expo-haptics', () => ({}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (r: unknown) => unknown) => select(record),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
let mockReadOnly = false;
let mockCanEdit = true;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: mockReadOnly }) }));
jest.mock('../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditCustomers: mockCanEdit } }),
}));
jest.mock('../hooks/use-image-attachment', () => ({
	useImageAttachment: () => ({ uri: 'avatar.png' }),
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));

const record = {
	uuid: 'one',
	payload: {
		first_name: 'Jane',
		last_name: 'Cooper',
		email: 'jane@example.com',
		billing: { city: 'Madrid', country: 'ES' },
	},
} as EngineRecord<'customers'>;
beforeEach(() => {
	mockReadOnly = false;
	mockCanEdit = true;
	mockPush.mockClear();
});
it('shows the record summary and opens the existing Edit route', () => {
	render(<CustomerRow record={record} />);
	const row = screen.getByTestId('customers-row-one');
	expect(row.textContent).toContain('Jane Cooper');
	expect(row.textContent).toContain('jane@example.com');
	expect(row.textContent).toContain('Madrid, ES');
	expect(screen.getByTestId('customer-email-jane@example.com')).toBeTruthy();
	fireEvent.click(row);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/customers/edit/[customerId]',
		params: { customerId: 'one' },
	});
});
it.each([
	[true, true],
	[false, false],
])('does not edit when readOnly=%s canEdit=%s', (readOnly, canEdit) => {
	mockReadOnly = readOnly;
	mockCanEdit = canEdit;
	render(<CustomerRow record={record} />);
	fireEvent.click(screen.getByTestId('customers-row-one'));
	expect(mockPush).not.toHaveBeenCalled();
});

it.each([
	['jane@example.com', 'jane@example.com'],
	['', 'common.guest'],
])('falls back from absent names to %s', (email, label) => {
	render(
		<CustomerRow
			record={{ ...record, payload: { ...record.payload, first_name: '', last_name: '', email } }}
		/>
	);
	expect(screen.getByTestId('customers-row-one').textContent).toContain(label);
});
