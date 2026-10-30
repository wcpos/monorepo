import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render } from '@testing-library/react';

import { ListItem } from './index';

jest.mock('react-native', () => ({
	View: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Pressable: ({
		onPress,
		testID,
		disabled,
		...props
	}: React.HTMLAttributes<HTMLDivElement> & {
		onPress?: React.MouseEventHandler<HTMLDivElement>;
		testID?: string;
		disabled?: boolean;
	}) => <div {...props} data-testid={testID} onClick={disabled ? undefined : onPress} />,
}));
let mockPointer: 'fine' | 'coarse' = 'coarse';
jest.mock('../lib/device', () => ({ usePointer: () => mockPointer }));
jest.mock('../icon-button', () => ({
	IconButton: ({
		onPress,
		disabled,
	}: {
		onPress: React.MouseEventHandler<HTMLButtonElement>;
		disabled?: boolean;
	}) => (
		<button onClick={onPress} disabled={disabled}>
			Remove
		</button>
	),
}));
jest.mock('../text', () => ({
	Text: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

it('uses the card surface and row height on the accent-wash surface', () => {
	const { getByTestId } = render(<ListItem testID="row" title="Paul" />);
	expect(getByTestId('row')).toHaveClass('min-h-row', 'bg-card', 'active:bg-accent');
});

it('announces the selected row, not only paints it', () => {
	const { getByTestId } = render(
		<ListItem testID="row" title="Paul" selected onPress={() => {}} />
	);
	expect(getByTestId('row')).toHaveAttribute('aria-selected', 'true');
});

it('preserves explicit variant priority over selected', () => {
	const { getByTestId, rerender } = render(<ListItem testID="row" selected />);
	expect(getByTestId('row')).toHaveClass('border-primary');
	rerender(<ListItem testID="row" selected variant="warning" />);
	expect(getByTestId('row')).toHaveClass('border-warning/40', 'bg-warning/10');
	expect(getByTestId('row')).not.toHaveClass('border-primary');
});

it('removes without activating the row', () => {
	const onPress = jest.fn();
	const onRemove = jest.fn();
	const { getByText } = render(
		<ListItem removable removeLabel="Remove" onPress={onPress} onRemove={onRemove} />
	);
	fireEvent.click(getByText('Remove'));
	expect(onRemove).toHaveBeenCalledTimes(1);
	expect(onPress).not.toHaveBeenCalled();
});

it('retires the background surface and tiny subtitle', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/bg-background|text-xs/);
});

it('cannot remove a disabled row', () => {
	const onRemove = jest.fn();
	const { getByText } = render(
		<ListItem removable removeLabel="Remove" disabled onRemove={onRemove} />
	);
	expect(getByText('Remove')).toBeDisabled();
	fireEvent.click(getByText('Remove'));
	expect(onRemove).not.toHaveBeenCalled();
});
