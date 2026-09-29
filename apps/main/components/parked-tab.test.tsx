import * as React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import { reloadApp } from '@wcpos/core/utils/reload-app';

import { ParkedTab } from './parked-tab';

jest.mock('@wcpos/core/utils/reload-app', () => ({ reloadApp: jest.fn() }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/button', () => {
	const { Pressable, Text } = jest.requireActual('react-native');
	return { Button: Pressable, ButtonText: Text };
});
jest.mock('@wcpos/components/empty-state', () => {
	const { View, Text } = jest.requireActual('react-native');
	return {
		EmptyState: ({
			title,
			description,
			testID,
		}: {
			title: string;
			description: string;
			testID: string;
		}) => (
			<View>
				<Text testID={`${testID}-title`}>{title}</Text>
				<Text testID={`${testID}-description`}>{description}</Text>
			</View>
		),
	};
});
const cases = [
	[
		{ kind: 'parked', reason: 'another-tab-live' },
		'The POS is open in another tab',
		'Only one tab can run the register.',
	],
	[
		{ kind: 'taking-over', deferral: null },
		'Taking over…',
		'Waiting for the other tab to hand over.',
	],
	[
		{ kind: 'taking-over', deferral: 'payment' },
		'Taking over…',
		'Waiting for the other tab to finish a payment.',
	],
	[
		{ kind: 'taking-over', deferral: 'write' },
		'Taking over…',
		'Waiting for the other tab to finish saving.',
	],
	[
		{ kind: 'taking-over', deferral: 'no-answer' },
		"The other tab isn't answering",
		'Close it, or reload it, to continue here.',
	],
	[
		{ kind: 'parked', reason: 'worker-lost' },
		'Local database unavailable',
		'Reload to keep selling.',
	],
] as const;
it.each(cases)('renders %j above providers', async (state, title, description) => {
	const takeOver = jest.fn();
	const screen = await render(<ParkedTab state={state} takeOver={takeOver} />);
	expect(screen.getByTestId('parked-tab-content-title').props.children).toBe(title);
	expect(screen.getByTestId('parked-tab-content-description').props.children).toBe(description);
	const lost = state.kind === 'parked' && state.reason === 'worker-lost';
	const button = screen.getByTestId(lost ? 'parked-tab-reload' : 'parked-tab-take-over');
	await fireEvent.press(button);
	if (lost) expect(reloadApp).toHaveBeenCalled();
	else expect(takeOver).toHaveBeenCalledTimes(state.kind === 'taking-over' ? 0 : 1);
	if (state.kind === 'taking-over') expect(button).toBeDisabled();
});
