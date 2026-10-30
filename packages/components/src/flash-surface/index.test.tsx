import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { FlashSurface } from './index';
import { EASE } from '../lib/motion';
import { DEFAULT_TRAITS, ThemeTraitsContext } from '../lib/theme-traits';

const mockTiming = jest.fn((value) => value);
const mockColor = jest.fn(() => 'red');
jest.mock('uniwind', () => ({
	useCSSVariable: (name: string) => (name === '--color-selected' ? 'red' : 'white'),
}));
jest.mock('../edge-surface', () => ({
	EdgeSurface: ({ children, className }: { children: React.ReactNode; className: string }) => (
		<div data-testid="surface" className={className}>
			{children}
		</div>
	),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		createAnimatedComponent: (Component: React.ComponentType) => (props: object) => (
			<div data-testid="animated">
				<Component {...props} />
			</div>
		),
	},
	Easing: { bezier: jest.fn() },
	Keyframe: class {
		duration() {
			return this;
		}
	},
	useReducedMotion: () => false,
	useSharedValue: (value: number) => React.useRef({ value }).current,
	useAnimatedStyle: (fn: () => object) => fn(),
	interpolateColor: (...args: unknown[]) => mockColor(...args),
	withTiming: (...args: unknown[]) => mockTiming(...args),
}));
beforeEach(() => {
	mockTiming.mockClear();
	mockColor.mockClear();
});
it.each([false, true])('draws the receipt surface with paidFlash=%s', (paidFlash) => {
	render(
		<ThemeTraitsContext.Provider value={{ ...DEFAULT_TRAITS, paidFlash }}>
			<FlashSurface edges={['top', 'bottom']}>
				<span>receipt</span>
			</FlashSurface>
		</ThemeTraitsContext.Provider>
	);
	expect(screen.getByText('receipt')).not.toBeNull();
	expect(screen.getByTestId('surface').className).toContain('bg-card');
	if (paidFlash) {
		expect(screen.getByTestId('animated')).not.toBeNull();
		expect(mockColor).toHaveBeenCalledWith(0, [0, 1], ['red', 'white']);
		expect(mockTiming).toHaveBeenCalledWith(1, { duration: 600, easing: EASE });
	} else {
		expect(screen.queryByTestId('animated')).toBeNull();
		expect(mockTiming).not.toHaveBeenCalled();
	}
});
