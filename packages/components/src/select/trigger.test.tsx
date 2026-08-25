import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { EMPTY_OPTION } from './controlled-value';
import { Value } from './trigger';

let mockRootValue: { value: string; label: string } | undefined;

jest.mock('@rn-primitives/select', () => ({
	useRootContext: () => ({ value: mockRootValue }),
	Trigger: () => null,
}));

// Ships untranspiled JSX, which this package's ts-only transform can't parse.
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
	mockRootValue = undefined;
});

describe('native Select value — placeholder', () => {
	it('shows the label of the current selection', () => {
		mockRootValue = { value: 'pending', label: 'Pending' };
		render(<Value placeholder="Status" />);

		expect(screen.getByText('Pending')).toBeTruthy();
	});

	/**
	 * Kept in parity with trigger.web.tsx: a controlled select clears to `EMPTY_OPTION`
	 * rather than `undefined`, so "no selection" arrives as a defined Option with an empty
	 * value. Reading `label ?? placeholder` would render its blank label instead.
	 */
	it('shows the placeholder for a cleared selection', () => {
		mockRootValue = EMPTY_OPTION;
		render(<Value placeholder="Status" />);

		expect(screen.getByText('Status')).toBeTruthy();
	});

	it('shows the placeholder when there is no value at all', () => {
		render(<Value placeholder="Status" />);

		expect(screen.getByText('Status')).toBeTruthy();
	});
});
