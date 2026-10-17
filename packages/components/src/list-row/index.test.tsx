import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ListRow } from './index';

let mockPointer: 'fine' | 'coarse' = 'fine';
// Keep RNW press behaviour; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: ({ testID, className, ...props }: { testID?: string; className?: string }) =>
			React.createElement('div', { ...props, 'data-testid': testID, 'data-classes': className }),
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('../lib/device', () => ({ usePointer: () => mockPointer }));

const classes = (testID: string) => screen.getByTestId(testID).dataset.classes ?? '';

beforeEach(() => {
	mockPointer = 'fine';
});

it('is a hairline-ruled row with the press and fine-pointer hover on bg-muted', () => {
	render(<ListRow testID="row" onPress={() => {}} />);
	expect(classes('row')).toContain('border-b');
	expect(classes('row')).toContain('min-h-14');
	expect(classes('row')).toContain('active:bg-muted');
	expect(classes('row')).toContain('web:hover:bg-muted');
	expect(classes('row')).not.toContain('rounded');
	expect(screen.getByTestId('row')).toHaveAttribute('role', 'button');
});

it('keeps hover off a coarse pointer, where it would stick after a tap', () => {
	mockPointer = 'coarse';
	render(<ListRow testID="row" onPress={() => {}} />);
	expect(classes('row')).not.toContain('hover:');
});

it('has 44 for a one-line row', () => {
	render(<ListRow testID="row" size="sm" />);
	expect(classes('row')).toContain('min-h-row');
	expect(classes('row')).not.toContain('min-h-14');
});

it('paints the selected row with the primary bar, and keeps the bar room on the others', () => {
	render(
		<>
			<ListRow testID="on" selected onPress={() => {}} />
			<ListRow testID="off" selected={false} onPress={() => {}} />
			<ListRow testID="plain" onPress={() => {}} />
		</>
	);
	expect(classes('on')).toContain('bg-muted');
	expect(classes('on')).toContain('border-l-primary');
	expect(screen.getByTestId('on')).toHaveAttribute('aria-selected', 'true');
	expect(classes('off')).toContain('border-l-transparent');
	expect(classes('off')).toContain('border-l-2');
	expect(screen.getByTestId('off')).toHaveAttribute('aria-selected', 'false');
	expect(classes('plain')).not.toContain('border-l-2');
	expect(screen.getByTestId('plain')).not.toHaveAttribute('aria-selected');
});

it('leaves a radio its checked state rather than a selected one, by either role prop', () => {
	render(
		<>
			<ListRow testID="radio" role="radio" aria-checked selected onPress={() => {}} />
			<ListRow testID="legacy" accessibilityRole="radio" selected onPress={() => {}} />
		</>
	);
	const row = screen.getByTestId('radio');
	expect(row).toHaveAttribute('role', 'radio');
	expect(row).toHaveAttribute('aria-checked', 'true');
	expect(row).not.toHaveAttribute('aria-selected');
	expect(screen.getByTestId('legacy')).not.toHaveAttribute('aria-selected');
});

it('puts leading, body and trailing in order, the body taking the room', () => {
	render(
		<ListRow
			testID="row"
			leading={<span data-testid="lead" />}
			trailing={<span data-testid="trail" />}
			bodyClassName="gap-1"
		>
			<span data-testid="body" />
		</ListRow>
	);
	const row = screen.getByTestId('row');
	const order = ['lead', 'body', 'trail'].map((id) =>
		Array.from(row.querySelectorAll('[data-testid]')).indexOf(screen.getByTestId(id))
	);
	expect(order).toEqual([...order].sort((a, b) => a - b));
	const body = screen.getByTestId('body').parentElement!;
	expect(body.dataset.classes).toContain('flex-1');
	expect(body.dataset.classes).toContain('min-w-0');
	expect(body.dataset.classes).toContain('gap-1');
});

it('presses, and a disabled row neither presses nor hides that it is unavailable', () => {
	const onPress = jest.fn();
	const { rerender } = render(<ListRow testID="row" onPress={onPress} />);
	fireEvent.click(screen.getByTestId('row'));
	expect(onPress).toHaveBeenCalledTimes(1);
	rerender(<ListRow testID="row" onPress={onPress} disabled />);
	fireEvent.click(screen.getByTestId('row'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(classes('row')).toContain('opacity-50');
});

it('is no button and no tab stop without an action', () => {
	render(
		<>
			<ListRow testID="row" />
			<ListRow testID="action" onPress={() => {}} />
		</>
	);
	expect(screen.getByTestId('row')).not.toHaveAttribute('role');
	expect(screen.getByTestId('row')).not.toHaveAttribute('tabindex', '0');
	expect(screen.getByTestId('action')).toHaveAttribute('tabindex', '0');
});
