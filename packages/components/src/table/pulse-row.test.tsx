import * as React from 'react';

import { act, render } from '@testing-library/react';

import { PulseTableRow, type PulseTableRowRef } from './pulse-row';

const ERROR_COLOR = '#d40924';

type StartedAnimation = { toValue: unknown; callback?: (finished: boolean) => void };

/**
 * Faithful-enough reanimated: `withTiming` records the animation it started and
 * parks its completion callback, and `cancelAnimation` resolves every parked
 * callback with `finished === false` — which is exactly how reanimated reports a
 * cancelled animation, and the behaviour that made #1693 possible.
 */
jest.mock('react-native-reanimated', () => {
	const actualReact = jest.requireActual<typeof import('react')>('react');
	const started: StartedAnimation[] = [];
	const pending: ((finished: boolean) => void)[] = [];

	return {
		__esModule: true,
		default: {
			View: ({ children, ...props }: any) => actualReact.createElement('div', props, children),
		},
		__started: started,
		__pending: pending,
		cancelAnimation: () => {
			pending.splice(0).forEach((callback) => callback(false));
		},
		useAnimatedStyle: () => ({}),
		useSharedValue: (value: any) => ({ value }),
		withSequence: (...animations: unknown[]) => animations,
		withTiming: (toValue: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
			started.push({ toValue, callback });
			if (callback) {
				pending.push(callback);
			}
			return toValue;
		},
	};
});

jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

jest.mock('uniwind', () => ({
	useCSSVariable: () => ['#ffffff', '#eeeeee', '#007936', ERROR_COLOR],
}));

const reanimated = jest.requireMock('react-native-reanimated') as {
	__started: StartedAnimation[];
	__pending: ((finished: boolean) => void)[];
};

/** Every remove pulse started so far (add pulses fade to the success colour). */
function removePulses() {
	return reanimated.__started.filter((animation) => animation.toValue === ERROR_COLOR);
}

/** Run every in-flight animation to completion. */
function finishPendingAnimations() {
	act(() => {
		reanimated.__pending.splice(0).forEach((callback) => callback(true));
	});
}

/** Let promise continuations queued by a settled pulse run. */
async function flushMicrotasks() {
	await act(async () => {
		await Promise.resolve();
	});
}

function renderRow() {
	const ref = React.createRef<PulseTableRowRef>();
	const { container } = render(
		<PulseTableRow
			ref={ref}
			row={{ id: 'row-1' } as any}
			table={{ options: { meta: {} } } as any}
			index={0}
		/>
	);
	return { ref, container };
}

beforeEach(() => {
	reanimated.__started.length = 0;
	reanimated.__pending.length = 0;
});

describe('PulseTableRow', () => {
	it('never carries a CSS color transition — it would fight the reanimated pulse', () => {
		// Incident 2026-08-19: `web:transition-colors` on this row low-pass
		// filtered reanimated's per-frame backgroundColor updates, so the
		// add/remove pulse never reached the success/error color and visibly
		// lagged and snapped. The animated inline style also always overrides
		// class-based backgrounds, so a transition class buys nothing here.
		const { container } = renderRow();

		const row = container.firstElementChild as HTMLElement;
		expect(row).not.toBeNull();
		expect(row.className).not.toMatch(/transition-colors/);
	});

	describe('pulseRemove re-entrancy (#1693)', () => {
		it('ignores repeat calls instead of cancelling the pending removal', () => {
			const { ref } = renderRow();
			const removeLine = jest.fn();

			// Three presses of the cart row's remove button, faster than the 400ms
			// pulse. Before the fix each press cancelled the in-flight fade — which
			// resolved its callback with `finished === false` and dropped that
			// press's removal — then started a fresh 400ms fade, so nothing was
			// removed until the cashier stopped clicking.
			act(() => ref.current!.pulseRemove(removeLine));
			act(() => ref.current!.pulseRemove(removeLine));
			act(() => ref.current!.pulseRemove(removeLine));

			expect(removePulses()).toHaveLength(1);
			expect(removeLine).not.toHaveBeenCalled();

			finishPendingAnimations();

			expect(removeLine).toHaveBeenCalledTimes(1);
		});

		it('stays latched while the committed removal is still in flight', async () => {
			const { ref } = renderRow();
			// A removal that has been committed but has not settled yet.
			const removeLine = jest.fn(() => new Promise<void>(() => {}));

			act(() => ref.current!.pulseRemove(removeLine));
			finishPendingAnimations();
			expect(removeLine).toHaveBeenCalledTimes(1);

			await flushMicrotasks();

			// A press landing mid-flight must not run the mutation a second time:
			// removing an already-removed uuid reports a stale cart line.
			act(() => ref.current!.pulseRemove(removeLine));
			finishPendingAnimations();

			expect(removePulses()).toHaveLength(1);
			expect(removeLine).toHaveBeenCalledTimes(1);
		});

		it('releases the latch when the committed removal rejects', async () => {
			const { ref } = renderRow();
			// The write failed, so the line is still in the cart. The caller owns
			// reporting the failure, hence the handled rejection here.
			const removeLine = jest.fn(() => Promise.reject(new Error('write failed')).catch(() => {}));

			act(() => ref.current!.pulseRemove(removeLine));
			finishPendingAnimations();
			await flushMicrotasks();

			// The row is still on screen and must not be stuck unremovable.
			act(() => ref.current!.pulseRemove(removeLine));
			expect(removePulses()).toHaveLength(2);

			finishPendingAnimations();
			expect(removeLine).toHaveBeenCalledTimes(2);
		});

		it('releases the latch when a pulse is cancelled without committing', () => {
			const { ref } = renderRow();
			const removeLine = jest.fn();

			act(() => ref.current!.pulseRemove(removeLine));
			// An add pulse cancels the remove pulse, so its removal never lands.
			act(() => ref.current!.pulseAdd());
			expect(removeLine).not.toHaveBeenCalled();

			// The row must remain removable rather than being stuck latched.
			act(() => ref.current!.pulseRemove(removeLine));
			expect(removePulses()).toHaveLength(2);

			finishPendingAnimations();
			expect(removeLine).toHaveBeenCalledTimes(1);
		});
	});
});
