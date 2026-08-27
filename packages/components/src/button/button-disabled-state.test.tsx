import * as React from 'react';

import { render } from '@testing-library/react';

/**
 * The `disabled` prop handed to Pressable must ALWAYS be a real boolean.
 *
 * On Android, React Native only calls `view.setEnabled(...)` when the
 * accessibilityState map carries a `disabled` key (BaseViewManager.setViewState
 * early-returns on null and skips absent keys). A Button that renders disabled
 * once and then passes `undefined` latches the native view at enabled=false —
 * invisible on screen and to JS touch handling, but TalkBack announces the
 * button as disabled and Maestro `enabled: true` waits never pass. That latch
 * kept the native nightly red at the Open POS gate (monorepo#1614, defect 1).
 */

const pressableProps: Record<string, unknown>[] = [];

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Pressable: ({ children, ...props }: any) => {
		pressableProps.push(props);
		return React.createElement(
			'button',
			{ 'data-testid': props.testID },
			typeof children === 'function' ? children({ pressed: false }) : children
		);
	},
	View: (props: any) => React.createElement('div', props),
	StyleSheet: { create: (styles: any) => styles },
}));

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('../hstack', () => ({
	HStack: ({ children, ...props }: any) => React.createElement('div', props, children),
}));

jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => React.createElement('span', null, name),
}));

jest.mock('../loader', () => ({
	Loader: () => React.createElement('span', null, 'loading'),
}));

jest.mock('../lib/utils', () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

jest.mock('../text', () => {
	const TextClassContext = React.createContext('');

	return {
		TextClassContext,
		Text: ({ children, numberOfLines: _numberOfLines, ...props }: any) =>
			React.createElement('span', props, children),
	};
});

// eslint-disable-next-line import/first
import { Button } from './index';
// eslint-disable-next-line import/first
import { IconButton } from '../icon-button';

const lastPressableProps = () => pressableProps[pressableProps.length - 1];

beforeEach(() => {
	pressableProps.length = 0;
});

describe('Button disabled state', () => {
	it('passes disabled: true while disabled', () => {
		render(<Button disabled>Open POS</Button>);
		expect(lastPressableProps().disabled).toBe(true);
		expect(lastPressableProps()['aria-disabled']).toBe(true);
	});

	it('passes disabled: false (never undefined) once re-enabled', () => {
		const { rerender } = render(<Button disabled>Open POS</Button>);
		rerender(<Button disabled={false}>Open POS</Button>);
		expect(lastPressableProps().disabled).toBe(false);
		expect(lastPressableProps()['aria-disabled']).toBe(false);
	});

	it('passes disabled: false when the prop is omitted entirely', () => {
		render(<Button>Open POS</Button>);
		expect(lastPressableProps().disabled).toBe(false);
		expect(lastPressableProps()['aria-disabled']).toBe(false);
	});

	it('treats loading as disabled, and re-enables as a boolean', () => {
		const { rerender } = render(<Button loading>Open POS</Button>);
		expect(lastPressableProps().disabled).toBe(true);
		rerender(<Button>Open POS</Button>);
		expect(lastPressableProps().disabled).toBe(false);
	});
});

describe('IconButton disabled state', () => {
	it('passes disabled: false (never undefined) once re-enabled', () => {
		const { rerender } = render(<IconButton name="arrowRight" disabled />);
		expect(lastPressableProps().disabled).toBe(true);
		rerender(<IconButton name="arrowRight" />);
		expect(lastPressableProps().disabled).toBe(false);
	});
});
