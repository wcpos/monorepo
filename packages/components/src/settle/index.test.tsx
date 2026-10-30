import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Settle } from './index';
import { BEAT, EASE_BEAT } from '../lib/motion';
import { DEFAULT_TRAITS, ThemeTraitsContext } from '../lib/theme-traits';

let mockReduced = false;
const mockWrites: number[] = [];
const mockTiming = jest.fn((value) => value);
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children }: { children: React.ReactNode }) => (
			<div data-testid="animated">{children}</div>
		),
	},
	Easing: { bezier: jest.fn() },
	Keyframe: class {
		duration() {
			return this;
		}
	},
	useReducedMotion: () => mockReduced,
	useSharedValue: (initial: number) =>
		React.useRef({
			get value() {
				return initial;
			},
			set value(value: number) {
				mockWrites.push(value);
			},
		}).current,
	useAnimatedStyle: (fn: () => object) => fn(),
	withTiming: (...args: unknown[]) => mockTiming(...args),
}));
beforeEach(() => {
	mockReduced = false;
	mockWrites.length = 0;
	mockTiming.mockClear();
});
it('does not animate on mount or an unchanged value; lands a changed value', () => {
	const child = <span>10</span>;
	const { rerender } = render(<Settle value={10}>{child}</Settle>);
	rerender(<Settle value={10}>{child}</Settle>);
	expect(mockWrites).toEqual([]);
	expect(mockTiming).not.toHaveBeenCalled();
	rerender(<Settle value={11}>{child}</Settle>);
	expect(mockWrites).toEqual([5, 0.4, 0, 1]);
	expect(mockTiming).toHaveBeenCalledWith(0, { duration: BEAT, easing: EASE_BEAT });
	expect(mockTiming).toHaveBeenCalledWith(1, { duration: BEAT, easing: EASE_BEAT });
});
it.each(['disabled', 'reduced'])('renders only its child when %s', (mode) => {
	mockReduced = mode === 'reduced';
	render(
		<ThemeTraitsContext.Provider value={{ ...DEFAULT_TRAITS, settle: mode !== 'disabled' }}>
			<Settle value={10}>
				<span>child</span>
			</Settle>
		</ThemeTraitsContext.Provider>
	);
	expect(screen.queryByTestId('animated')).toBeNull();
	expect(screen.getByText('child')).not.toBeNull();
	expect(mockTiming).not.toHaveBeenCalled();
});
