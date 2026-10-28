/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { StatusFilterCell } from './status-filter-cell';

jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant }: { label: string; variant: string }) => (
		<span data-testid="badge" data-variant={variant}>
			{label}
		</span>
	),
}));

const options = [
	{ value: 'publish', label: 'Published' },
	{ value: 'draft', label: 'Draft' },
];
const tones = { publish: 'success', draft: 'muted' } as const;

function renderCell(value: string | undefined, setFilter = jest.fn()) {
	render(
		<StatusFilterCell
			table={{ options: { meta: { actions: { setFilter } } } }}
			field="status"
			value={value}
			options={options}
			tones={tones}
			testID="status-cell"
		/>
	);
	return setFilter;
}

it.each([
	['publish', 'Published', 'success'],
	['draft', 'Draft', 'muted'],
	// A value the list has no word for (a custom status) shows itself, in the default tone.
	['wc-custom', 'wc-custom', 'default'],
])('names %s from the options and filters the list to it on press', (value, label, tone) => {
	const setFilter = renderCell(value);
	expect(screen.getByTestId('badge').textContent).toBe(label);
	expect(screen.getByTestId('badge').getAttribute('data-variant')).toBe(tone);
	expect(screen.getByRole('button').getAttribute('aria-label')).toBe(label);
	fireEvent.click(screen.getByTestId('status-cell'));
	expect(setFilter).toHaveBeenCalledWith('status', value);
});

it('sets no filter for a row without a value', () => {
	const setFilter = renderCell(undefined);
	fireEvent.click(screen.getByTestId('status-cell'));
	expect(setFilter).not.toHaveBeenCalled();
});

it('presses safely in a table that hands no actions', () => {
	render(
		<StatusFilterCell
			table={{ options: {} }}
			field="status"
			value="draft"
			options={options}
			tones={tones}
			testID="status-cell"
		/>
	);
	expect(() => fireEvent.click(screen.getByTestId('status-cell'))).not.toThrow();
});

// The library Button pulls in uniwind's ESM; the cell needs only its press and its label.
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		accessibilityLabel,
		onPress,
	}: {
		children?: React.ReactNode;
		testID?: string;
		accessibilityLabel?: string;
		onPress?: () => void;
	}) => (
		<button data-testid={testID} aria-label={accessibilityLabel} onClick={onPress}>
			{children}
		</button>
	),
}));
