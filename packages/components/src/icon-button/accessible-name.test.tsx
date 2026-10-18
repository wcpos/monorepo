import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { IconButton } from './index';

/**
 * An icon-only button has no text, so its `accessibilityLabel` is the only thing a screen
 * reader can announce (the prop is required in the type). On web react-native-web renders it
 * as the button's `aria-label`; on iOS and Android it is the native Pressable's
 * `accessibilityLabel`, which VoiceOver and TalkBack read.
 */

const mockPlatform = { OS: 'web' };
const mockNativePressables: Record<string, unknown>[] = [];

jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		get Platform() {
			return { ...actual.Platform, OS: mockPlatform.OS };
		},
		Pressable: (props: React.ComponentProps<typeof actual.Pressable>) => {
			if (mockPlatform.OS !== 'web') {
				// What the native view receives; RN-web's DOM output stands in for nothing here.
				mockNativePressables.push(props as Record<string, unknown>);
			}
			return <actual.Pressable {...props} />;
		},
	};
});
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../icon', () => ({ Icon: () => null }));

afterEach(() => {
	mockPlatform.OS = 'web';
	mockNativePressables.length = 0;
});

it('names the button with its label on web', () => {
	render(<IconButton name="plus" accessibilityLabel="Add product" testID="add" />);
	expect(screen.getByRole('button', { name: 'Add product' })).toBe(screen.getByTestId('add'));
});

it.each(['ios', 'android'])('hands the label to the native button on %s', (os) => {
	mockPlatform.OS = os;
	render(<IconButton name="plus" accessibilityLabel="Add product" testID="add" />);
	expect(mockNativePressables.at(-1)).toEqual(
		expect.objectContaining({ accessibilityLabel: 'Add product', role: 'button' })
	);
});
