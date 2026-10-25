import * as React from 'react';
import type { PressableProps } from 'react-native';

import { act, fireEvent, render, screen } from '@testing-library/react';
import * as Popover from '@rn-primitives/popover';
import * as Select from '@rn-primitives/select';

import { Chip } from './index';
import { ComboboxTrigger } from '../combobox/combobox';
import { Trigger as SelectTrigger } from '../select/trigger.web';

jest.mock('@rn-primitives/popover', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/popover').replace(/index\.js$/, 'popover.web.js')
	)
);
jest.mock('@rn-primitives/select', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/select').replace(/index\.js$/, 'select.web.js')
	)
);
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const longPresses = new Map();
	return {
		...actual,
		longPresses,
		Pressable: (props: PressableProps) => {
			longPresses.set(props.testID, props.onLongPress);
			return <actual.Pressable {...props} />;
		},
	};
});
// Only native layout/list dependencies: the Chip, Slot, picker roots and triggers stay real.
jest.mock('react-native-gesture-handler', () => ({ ScrollView: () => null }));
jest.mock('../virtualized-list', () => ({}));
jest.mock('../lib/native-popover-sizing', () => ({}));
jest.mock('../lib/overlay', () => ({}));
jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('../input', () => ({ Input: () => null }));
jest.mock('../lib/min-target', () => ({ useMinTargetSlop: () => ({}) }));

function SelectState() {
	const { open } = Select.useRootContext();
	return <output data-testid="picker-open">{String(open)}</output>;
}
function ComboboxState() {
	const { open } = Popover.useRootContext();
	return <output data-testid="picker-open">{String(open)}</output>;
}

it.each(['select', 'combobox'] as const)(
	'%s asChild preserves the label long-press/right-click and ordinary tap',
	(kind) => {
		const onLongPress = jest.fn();
		const Root = kind === 'select' ? Select.Root : Popover.Root;
		const Trigger = kind === 'select' ? SelectTrigger : ComboboxTrigger;
		const State = kind === 'select' ? SelectState : ComboboxState;
		render(
			<Root>
				<Trigger asChild>
					<Chip label="Selected" testID="chip" onClear={jest.fn()} onLongPress={onLongPress} />
				</Trigger>
				<State />
			</Root>
		);
		const label = screen.getByTestId('chip-label');
		const handler = jest.requireMock('react-native').longPresses.get('chip-label');
		expect(handler).toBe(onLongPress);
		act(() => handler({}));
		expect(onLongPress).toHaveBeenCalledTimes(1);
		expect(fireEvent.contextMenu(label)).toBe(false);
		expect(onLongPress).toHaveBeenCalledTimes(2);
		expect(screen.getByTestId('picker-open')).toHaveTextContent('false');
		// The custom Select web trigger uses the pointerdown's touch type, not the click's type.
		if (kind === 'select') {
			label.hasPointerCapture = () => false;
			const down = new Event('pointerdown', { bubbles: true });
			Object.defineProperty(down, 'pointerType', { value: 'touch' });
			fireEvent(label, down);
		}
		fireEvent.click(label);
		expect(screen.getByTestId('picker-open')).toHaveTextContent('true');
		expect(onLongPress).toHaveBeenCalledTimes(2);
	}
);
