import * as React from 'react';

import { render } from '@testing-library/react';

const mockPlatform = { OS: 'ios', isNative: true, isWeb: false, isElectron: false };

const animatedViewProps: any[] = [];
const sharedValues: { value: unknown }[] = [];
const styleFactories: (() => object)[] = [];
const withTimingMock = jest.fn((toValue: number, config: unknown) => ({
	__anim: 'timing',
	toValue,
	config,
}));
const withRepeatMock = jest.fn((...args: unknown[]) => ({
	__anim: 'repeat',
	args,
}));
const cancelAnimationMock = jest.fn();

jest.mock(
	'@wcpos/utils/platform',
	() => ({
		Platform: mockPlatform,
	}),
	{ virtual: true }
);

jest.mock('uniwind', () => ({
	useCSSVariable: () => '#123456',
}));

jest.mock('../text', () => ({
	TextClassContext: React.createContext(''),
	Text: ({ children }: any) => React.createElement('span', null, children),
}));

jest.mock('react-native-svg', () => ({
	__esModule: true,
	default: ({ children }: any) => React.createElement('svg', null, children),
	Circle: () => React.createElement('circle'),
}));

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, className, style, ...props }: any) => {
			animatedViewProps.push({ className, style, ...props });
			return React.createElement('div', { 'data-testid': 'loader-spin', className }, children);
		},
	},
	Easing: { linear: 'mock-linear-easing' },
	ReduceMotion: { Never: 'mock-reduce-motion-never', System: 'mock-reduce-motion-system' },
	cancelAnimation: (...args: unknown[]) => cancelAnimationMock(...args),
	useAnimatedStyle: (factory: () => object) => {
		styleFactories.push(factory);
		return factory();
	},
	useSharedValue: (value: unknown) => {
		const sharedValue = { value };
		sharedValues.push(sharedValue);
		return sharedValue;
	},
	withRepeat: (...args: unknown[]) => withRepeatMock(...args),
	withTiming: (...args: [number, unknown]) => withTimingMock(...args),
}));

// Import after mocks so the Loader binds the mocked modules.
// eslint-disable-next-line import/first
import { Loader } from './index';

describe('Loader', () => {
	beforeEach(() => {
		animatedViewProps.length = 0;
		sharedValues.length = 0;
		styleFactories.length = 0;
		withTimingMock.mockClear();
		withRepeatMock.mockClear();
		cancelAnimationMock.mockClear();
		mockPlatform.OS = 'ios';
		mockPlatform.isNative = true;
		mockPlatform.isWeb = false;
		mockPlatform.isElectron = false;
	});

	it('drives an infinite linear rotation via reanimated on native', () => {
		// Regression: uniwind has no keyframe-animation support on native, so the
		// `animate-spin` class alone left the spinner frozen on iOS/Android
		// (sync icon and checkout button loaders never rotated).
		render(<Loader />);

		// Matches web's tailwind `animate-spin`: one full turn per second,
		// linear. ReduceMotion.Never on both layers — a spinner is a functional
		// progress indicator, and web's CSS animation ignores reduce-motion too;
		// without the 5th withRepeat arg the repeat is suppressed even when the
		// inner timing opts out.
		expect(withTimingMock).toHaveBeenCalledWith(360, {
			duration: 1000,
			easing: 'mock-linear-easing',
			reduceMotion: 'mock-reduce-motion-never',
		});
		const timingResult = withTimingMock.mock.results[0].value;
		expect(withRepeatMock).toHaveBeenCalledWith(
			timingResult,
			-1,
			false,
			undefined,
			'mock-reduce-motion-never'
		);

		// The effect must animate the SAME shared value the transform reads:
		// (a) the mount effect assigned the repeat animation to the shared value…
		const repeatResult = withRepeatMock.mock.results[0].value;
		expect(sharedValues).toHaveLength(1);
		expect(sharedValues[0].value).toBe(repeatResult);

		// …and (b) re-running the style worklet after changing that shared value
		// moves the rendered rotation, proving the transform reads it.
		sharedValues[0].value = 123;
		expect(JSON.stringify(styleFactories[0]())).toContain('123deg');

		// The style must actually be attached to the rendered element on native.
		expect(JSON.stringify(animatedViewProps.at(-1)?.style)).toContain('rotate');

		// The spin class must stay web-scoped — a bare `animate-spin` is the
		// original bug (inert on native, but signals the CSS path is trusted).
		const nativeClassName = String(animatedViewProps.at(-1)?.className ?? '');
		expect(nativeClassName).not.toMatch(/(^|\s)animate-spin/);
	});

	it('cancels the rotation on unmount (native)', () => {
		const { unmount } = render(<Loader />);
		unmount();
		expect(cancelAnimationMock).toHaveBeenCalledWith(sharedValues[0]);
	});

	it('leaves the spin to the CSS animation on web — no JS driver, no inline transform', () => {
		// A JS-driven spinner on web stutters while the JS thread is busy (i.e.
		// during sync — exactly when spinners show), and an inline animated
		// transform would fight the CSS animation for the same property.
		mockPlatform.OS = 'web';
		mockPlatform.isNative = false;
		mockPlatform.isWeb = true;

		const { getByTestId } = render(<Loader />);

		expect(withRepeatMock).not.toHaveBeenCalled();

		const spinView = getByTestId('loader-spin');
		expect(spinView.className).toMatch(/web:animate-spin/);
		const inlineStyle = animatedViewProps.at(-1)?.style;
		expect(JSON.stringify(inlineStyle ?? {})).not.toMatch(/rotate/);
	});
});
