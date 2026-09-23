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
jest.mock('../icon-button', () => ({
	IconButton: ({ onPress }: { onPress: React.MouseEventHandler<HTMLButtonElement> }) => (
		<button onClick={onPress}>Remove</button>
	),
}));
jest.mock('../text', () => ({
	Text: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

it('uses the card surface, row height and muted press with disabled opacity', () => {
	const { getByTestId } = render(<ListItem testID="row" title="Paul" disabled />);
	expect(getByTestId('row')).toHaveClass('min-h-row', 'bg-card', 'active:bg-muted', 'opacity-45');
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
	const { getByRole } = render(<ListItem removable onPress={onPress} onRemove={onRemove} />);
	fireEvent.click(getByRole('button'));
	expect(onRemove).toHaveBeenCalledTimes(1);
	expect(onPress).not.toHaveBeenCalled();
});

it('retires the background surface and tiny subtitle', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/bg-background|text-xs/);
});
