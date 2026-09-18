import * as fs from 'fs';
import * as path from 'path';

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

/**
 * A class assertion has to read the source: `react-native` is mapped to
 * `react-native-web` here, which drops `className` before it reaches the DOM, so
 * the rendered tree cannot be asked what the trigger's classes are.
 */
describe('Select trigger control height', () => {
	const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

	// All three triggers — single, multi and the SelectButton — are one control
	// tall from the floored scale token, not a literal 40 px (roadmap#357).
	it('sizes every trigger on the control token, not h-10', () => {
		expect(source.match(/h-ctl/g)).toHaveLength(3);
		expect(source).not.toContain('h-10');
		expect(source.match(/rounded-lg/g)).toHaveLength(3);
	});
});
