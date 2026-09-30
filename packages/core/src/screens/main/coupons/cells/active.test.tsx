/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ActiveBadge } from './active';

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/query', () => ({}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (s: string) => new Date(`${s}Z`),
}));
it.each([
	['publish', null, 'coupons.active', 'success'],
	['publish', '2000-01-01T00:00:00', 'coupons.inactive', 'muted'],
	['draft', null, 'coupons.inactive', 'muted'],
])(
	'labels status=%s expiry=%s without relying on color',
	(status, dateExpiresGmt, label, color) => {
		render(<ActiveBadge status={status} dateExpiresGmt={dateExpiresGmt} />);
		expect(screen.getByText(label)).toBeTruthy();
		expect(screen.getByTestId('status').getAttribute('data-variant')).toBe(color);
	}
);

jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant }: { label: string; variant: string }) => (
		<span data-testid="status" data-variant={variant}>
			{label}
		</span>
	),
}));
