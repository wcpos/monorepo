import * as React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import { reloadApp } from '@wcpos/core/utils/reload-app';

import { ParkedTab } from './parked-tab';

jest.mock('@wcpos/core/utils/reload-app', () => ({ reloadApp: jest.fn() }));
// GateScreen's own rendering is covered in packages/components; here the stand-in shows the
// props ParkedTab chooses: the tone, the copy under GateScreen's derived testIDs, the one primary.
jest.mock('@wcpos/components/gate-screen', () => {
	const { View, Text, Pressable } = jest.requireActual('react-native');
	return {
		GateScreen: ({
			testID,
			tone,
			title,
			description,
			detail,
			primary,
			secondary,
		}: {
			testID: string;
			tone: string;
			title: string;
			description: string;
			detail?: string;
			primary: { label: string; onPress(): void; testID: string; disabled?: boolean };
			secondary?: unknown;
		}) => (
			<View testID={testID}>
				<Text testID={`${testID}-tone`}>{tone}</Text>
				<Text testID={`${testID}-title`}>{title}</Text>
				<Text testID={`${testID}-description`}>{description}</Text>
				{detail ? <Text testID={`${testID}-detail`}>{detail}</Text> : null}
				<Pressable testID={primary.testID} disabled={primary.disabled} onPress={primary.onPress}>
					<Text>{primary.label}</Text>
				</Pressable>
				{secondary ? <Text testID="unexpected-secondary" /> : null}
			</View>
		),
	};
});
const cases = [
	[
		{ kind: 'parked', reason: 'another-tab-live' },
		'The POS is open in another tab',
		'Only one tab can run the register.',
		'muted',
	],
	[
		{ kind: 'taking-over', deferral: null },
		'Taking over…',
		'Waiting for the other tab to hand over.',
		'muted',
	],
	[
		{ kind: 'taking-over', deferral: 'payment' },
		'Taking over…',
		'Waiting for the other tab to finish a payment.',
		'muted',
	],
	[
		{ kind: 'taking-over', deferral: 'write' },
		'Taking over…',
		'Waiting for the other tab to finish saving.',
		'muted',
	],
	[
		{ kind: 'taking-over', deferral: 'no-answer' },
		"The other tab isn't answering",
		'Close it, or reload it, to continue here.',
		'warning',
	],
	[
		{ kind: 'parked', reason: 'worker-lost' },
		'Local database unavailable',
		'Reload to keep selling.',
		'bad',
	],
] as const;
it.each(cases)('renders %j above providers', async (state, title, description, tone) => {
	const takeOver = jest.fn();
	const screen = await render(<ParkedTab state={state} takeOver={takeOver} />);
	expect(screen.getByTestId('parked-tab-content-title').props.children).toBe(title);
	expect(screen.getByTestId('parked-tab-content-description').props.children).toBe(description);
	expect(screen.getByTestId('parked-tab-content-tone').props.children).toBe(tone);
	expect(screen.queryByTestId('unexpected-secondary')).toBeNull();
	const lost = state.kind === 'parked' && state.reason === 'worker-lost';
	const button = screen.getByTestId(lost ? 'parked-tab-reload' : 'parked-tab-take-over');
	await fireEvent.press(button);
	if (lost) expect(reloadApp).toHaveBeenCalled();
	else expect(takeOver).toHaveBeenCalledTimes(state.kind === 'taking-over' ? 0 : 1);
	if (state.kind === 'taking-over') expect(button).toBeDisabled();
});

it('shows the worker failure detail', async () => {
	const screen = await render(
		<ParkedTab
			state={{ kind: 'parked', reason: 'worker-lost' }}
			takeOver={jest.fn()}
			detail="why"
		/>
	);
	expect(screen.getByTestId('parked-tab-content-detail').props.children).toBe('why');
});

it('hides the detail when another tab is live', async () => {
	const screen = await render(
		<ParkedTab
			state={{ kind: 'parked', reason: 'another-tab-live' }}
			takeOver={jest.fn()}
			detail="why"
		/>
	);
	expect(screen.queryByTestId('parked-tab-content-detail')).toBeNull();
});
