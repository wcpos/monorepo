import * as React from 'react';

import { fireEvent, render } from '@testing-library/react';

const mockPlatform = { OS: 'ios', isNative: true, isWeb: false, isElectron: false };

const sharedValues: { value: number }[] = [];
type TimingCallback = ((finished: boolean) => void) | undefined;
const timings: { toValue: number; config: { duration: number }; callback: TimingCallback }[] = [];
const repeats: unknown[][] = [];
const sequences: unknown[][] = [];
const cancelAnimationMock = jest.fn();

jest.mock('@wcpos/utils/platform', () => ({ Platform: mockPlatform }), { virtual: true });

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: React.forwardRef(function AnimatedView({ children, className }: any, ref: any) {
			return React.createElement('div', { ref, 'data-testid': 'spin', className }, children);
		}),
	},
	Keyframe: jest.fn(() => ({ duration: jest.fn() })),
	Easing: { linear: 'linear', bezier: () => (value: number) => value },
	ReduceMotion: { Never: 'never', System: 'system' },
	cancelAnimation: (...args: unknown[]) => cancelAnimationMock(...args),
	useAnimatedStyle: (factory: () => object) => factory(),
	// One object per mount, as the real hook: a fresh one per render would reset the angle.
	useSharedValue: (value: number) => {
		const ref = React.useRef<{ value: number } | null>(null);
		if (!ref.current) {
			ref.current = { value };
			sharedValues.push(ref.current);
		}
		return ref.current;
	},
	withRepeat: (...args: unknown[]) => {
		repeats.push(args);
		return { __anim: 'repeat' };
	},
	withSequence: (...steps: unknown[]) => {
		sequences.push(steps);
		return { __anim: 'sequence', steps };
	},
	withTiming: (toValue: number, config: { duration: number }, callback: TimingCallback) => {
		timings.push({ toValue, config, callback });
		return { __anim: 'timing', toValue };
	},
}));

// eslint-disable-next-line import/first
import { Spin } from './spin';

beforeEach(() => {
	sharedValues.length = 0;
	timings.length = 0;
	repeats.length = 0;
	sequences.length = 0;
	cancelAnimationMock.mockClear();
	mockPlatform.isNative = true;
	mockPlatform.isWeb = false;
});

// The glyph's turn finishes before it rests: the stop is a timing to the next full turn at the
// same speed, never a jump back to 0 from mid-turn.
it('native: repeats the turn while active, then finishes the turn in progress and rests at 0', () => {
	const { rerender } = render(<Spin active>{null}</Spin>);
	expect(repeats).toHaveLength(1);
	expect(timings[0]).toMatchObject({ toValue: 360, config: { duration: 1000 } });

	// Three quarters of the way round when the work ends.
	sharedValues[0].value = 270;
	rerender(<Spin active={false}>{null}</Spin>);
	expect(cancelAnimationMock).toHaveBeenCalled();
	const finish = timings[timings.length - 1];
	expect(finish).toMatchObject({ toValue: 360, config: { duration: 250 } });
	finish.callback?.(true);
	expect(sharedValues[0].value).toBe(0);
});

// Active again while the finishing turn is still running: that turn completes, the value resets
// to 0, and only then do the laps repeat, so no lap starts mid-turn (Codex review on #ui-polish-7).
it('native: a restart mid-turn finishes the turn before the laps repeat from 0', () => {
	const { rerender } = render(<Spin active>{null}</Spin>);
	sharedValues[0].value = 270;
	rerender(<Spin active={false}>{null}</Spin>);
	// The finishing turn is 20° along when the work resumes.
	sharedValues[0].value = 340;
	rerender(<Spin active>{null}</Spin>);
	expect(sequences).toHaveLength(1);
	// The sequence and its reset are exempt from reduce-motion, or the reset is skipped without
	// landing on 0 and every lap after a restart is 360→360.
	const [reduceMotion, finish, reset, laps] = sequences[0] as {
		toValue?: number;
		__anim: string;
	}[];
	expect(reduceMotion).toBe('never');
	expect(finish).toMatchObject({ __anim: 'timing', toValue: 360 });
	expect(timings[timings.length - 1]).toMatchObject({
		toValue: 0,
		config: { duration: 0, reduceMotion: 'never' },
	});
	// The finishing timing is pushed after the laps' and before the reset's: the rest of the turn
	// at the same speed.
	expect(timings[timings.length - 2]).toMatchObject({
		toValue: 360,
		config: { duration: (1000 * 20) / 360 },
	});
	expect(reset).toMatchObject({ __anim: 'timing', toValue: 0 });
	expect(laps).toMatchObject({ __anim: 'repeat' });
	// Idle at 0 or a fresh mount: no sequence, the laps alone.
	expect(repeats).toHaveLength(2);
});

it('native: a glyph that never turned does not turn when mounted idle', () => {
	render(<Spin active={false}>{null}</Spin>);
	expect(repeats).toHaveLength(0);
	expect(timings).toHaveLength(0);
});

// Web keeps the CSS animation and takes the class off on the iteration boundary, where the
// glyph is upright again, not the moment the work ends.
it('web: keeps the class until the animation iteration after the work ends', () => {
	mockPlatform.isNative = false;
	mockPlatform.isWeb = true;
	const { getByTestId, rerender } = render(<Spin active>{null}</Spin>);
	expect(getByTestId('spin').className).toContain('animate-spin');
	expect(repeats).toHaveLength(0);

	rerender(<Spin active={false}>{null}</Spin>);
	expect(getByTestId('spin').className).toContain('animate-spin');
	fireEvent(getByTestId('spin'), new Event('animationiteration'));
	expect(getByTestId('spin').className).not.toContain('animate-spin');
});
