/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { CouponRow } from './row';

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
	useUserCapabilities: () => ({ caps: { canEditCoupons: mockCanEdit } }),
}));
jest.mock('../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: (n: number) => n.toFixed(2) }),
}));
jest.mock('../../../hooks/use-store-day-label', () => ({
	useStoreDayLabel: () => ({ day: () => 'Sat 12 Sep' }),
}));

const record = {
	uuid: 'one',
	payload: {
		code: 'summer',
		description: 'Summer savings',
		discount_type: 'percent',
		amount: '10',
		status: 'publish',
		date_expires_gmt: '2099-09-12T00:00:00',
	},
} as EngineRecord<'coupons'>;
beforeEach(() => {
	mockReadOnly = false;
	mockCanEdit = true;
	mockPush.mockClear();
});
it('shows the record summary and opens the existing Edit route', () => {
	render(<CouponRow record={record} />);
	const row = screen.getByTestId('coupons-row-one');
	expect(row.textContent).toContain('summer');
	expect(row.textContent).toContain('Summer savings');
	expect(row.textContent).toContain('coupons.percent_short · 10.00 · coupons.expires Sat 12 Sep');
	expect(row.textContent).toContain('coupons.active');
	expect(screen.queryByRole('textbox')).toBeNull();
	fireEvent.click(row);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/coupons/edit/[couponId]',
		params: { couponId: 'one' },
	});
});
it.each([
	[true, true],
	[false, false],
])('does not edit when readOnly=%s canEdit=%s', (readOnly, canEdit) => {
	mockReadOnly = readOnly;
	mockCanEdit = canEdit;
	render(<CouponRow record={record} />);
	fireEvent.click(screen.getByTestId('coupons-row-one'));
	expect(mockPush).not.toHaveBeenCalled();
});

jest.mock('../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (s: string) => new Date(`${s}Z`),
}));
