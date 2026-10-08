import * as React from 'react';

import { act, render } from '@testing-library/react';

import { PulseTableRow, type PulseTableRowRef } from './pulse-row';

// The removal tint's peak opacity: what tells a remove pulse from an add pulse here.
const TINT_REMOVED = 0.3;

type StartedAnimation = { toValue: unknown; callback?: (finished: boolean) => void };
let mockReduced = false;

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
	const layouts: ((event: unknown) => void)[] = [];

	return {
		__esModule: true,
		default: {
			View: ({ children, onLayout, ...props }: any) => {
				if (onLayout) layouts.push(onLayout);
				return actualReact.createElement('div', props, children);
			},
		},
		__layouts: layouts,
		Easing: { bezier: () => 'ease' },
		__started: started,
		__pending: pending,
		cancelAnimation: () => {
			pending.splice(0).forEach((callback) => callback(false));
		},
		useAnimatedStyle: () => ({}),
		useReducedMotion: () => mockReduced,
		useSharedValue: (value: any) => {
			const shared = {
				value,
				get: () => shared.value,
				set: (next: any) => {
					shared.value = next;
				},
			};
			return shared;
		},
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

const reanimated = jest.requireMock('react-native-reanimated') as {
	__started: StartedAnimation[];
	__pending: ((finished: boolean) => void)[];
	__layouts: ((event: unknown) => void)[];
};

/** The row's natural height, as its layout reports it. */
function layRowOut(height = 44) {
	act(() => reanimated.__layouts.at(-1)!({ nativeEvent: { layout: { height } } }));
}
/** Every gap-close started so far: the row's height going to nothing. */
function closes() {
	return reanimated.__started.filter((animation) => animation.toValue === 0);
}

/** Every remove pulse started so far (an add pulse rises to its own, lower, tint). */
function removePulses() {
	return reanimated.__started.filter((animation) => animation.toValue === TINT_REMOVED);
}

/** Run every in-flight animation to completion, and whatever each one starts in turn. */
function finishPendingAnimations() {
	act(() => {
		while (reanimated.__pending.length) {
			reanimated.__pending.splice(0).forEach((callback) => callback(true));
		}
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
	reanimated.__layouts.length = 0;
	mockReduced = false;
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

		it('restarts after an add pulse cancels a remove pulse, and the restart commits', () => {
			// Reachable from the cart: `detectNewCartLines` reports a line whose
			// QUANTITY changed, so the table fires `pulseAdd()` on a row that may be
			// mid-remove-pulse. That cancels the remove pulse and its removal never
			// lands, so the row has to stay removable — this is why the re-entrancy
			// guard lives here, on the only side that can see the cancellation.
			const { ref } = renderRow();
			const cancelledRemoval = jest.fn();
			const committedRemoval = jest.fn();

			act(() => ref.current!.pulseRemove(cancelledRemoval));
			act(() => ref.current!.pulseAdd());
			expect(cancelledRemoval).not.toHaveBeenCalled();

			act(() => ref.current!.pulseRemove(committedRemoval));
			expect(removePulses()).toHaveLength(2);

			finishPendingAnimations();

			expect(committedRemoval).toHaveBeenCalledTimes(1);
			expect(cancelledRemoval).not.toHaveBeenCalled();
		});
	});

	describe('swipe to remove (chosen 2026-10-08)', () => {
		it('armRemove turns the removal tint on and off without committing anything', () => {
			const { ref } = renderRow();
			act(() => ref.current!.armRemove(true));
			expect(removePulses()).toHaveLength(1);
			act(() => ref.current!.armRemove(false));
			expect(reanimated.__started.at(-1)?.toValue).toBe(0);
			finishPendingAnimations();
			expect(closes()).toHaveLength(1);
			expect(reanimated.__pending).toHaveLength(0);
		});

		it('armRemove is ignored while a removal is committing', () => {
			const { ref } = renderRow();
			act(() => ref.current!.pulseRemove(jest.fn()));
			act(() => ref.current!.armRemove(false));
			expect(reanimated.__started).toHaveLength(1);
		});

		it('closes the gap after the tint and commits the removal only once it is shut', () => {
			const { ref } = renderRow();
			layRowOut(44);
			const removeLine = jest.fn();
			act(() => ref.current!.pulseRemove(removeLine));
			expect(closes()).toHaveLength(0);
			// The tint lands: the row starts closing, nothing is removed yet.
			act(() => reanimated.__pending.splice(0).forEach((callback) => callback(true)));
			expect(closes()).toHaveLength(1);
			expect(removeLine).not.toHaveBeenCalled();
			// The gap is shut: the data may change under the rows below.
			act(() => reanimated.__pending.splice(0).forEach((callback) => callback(true)));
			expect(removeLine).toHaveBeenCalledTimes(1);
		});

		it('an unmeasured row, or reduced motion, commits straight after the tint', () => {
			const { ref } = renderRow();
			const removeLine = jest.fn();
			act(() => ref.current!.pulseRemove(removeLine));
			act(() => reanimated.__pending.splice(0).forEach((callback) => callback(true)));
			expect(closes()).toHaveLength(0);
			expect(removeLine).toHaveBeenCalledTimes(1);

			mockReduced = true;
			const reducedRow = renderRow();
			layRowOut(44);
			const removeReduced = jest.fn();
			act(() => reducedRow.ref.current!.pulseRemove(removeReduced));
			act(() => reanimated.__pending.splice(0).forEach((callback) => callback(true)));
			expect(closes()).toHaveLength(0);
			expect(removeReduced).toHaveBeenCalledTimes(1);
		});
	});

	describe('cancellation while the row is on its way out (Codex, #2447)', () => {
		it('an armed row skips the tint and starts closing at once', () => {
			const { ref } = renderRow();
			layRowOut(44);
			act(() => ref.current!.armRemove(true));
			finishPendingAnimations();
			reanimated.__started.length = 0;
			const removeLine = jest.fn();
			act(() => ref.current!.pulseRemove(removeLine));
			expect(removePulses()).toHaveLength(0);
			expect(closes()).toHaveLength(1);
			finishPendingAnimations();
			expect(removeLine).toHaveBeenCalledTimes(1);
		});

		it('an add pulse during the close cancels the removal and tells the caller', () => {
			const { ref } = renderRow();
			layRowOut(44);
			const removeLine = jest.fn();
			const onCancel = jest.fn();
			act(() => ref.current!.pulseRemove(removeLine, { onCancel }));
			// The tint lands and the gap starts closing.
			act(() => reanimated.__pending.splice(0).forEach((callback) => callback(true)));
			expect(closes()).toHaveLength(1);
			// A quantity change arrives: the add takes over, the close is cancelled.
			act(() => ref.current!.pulseAdd());
			expect(removeLine).not.toHaveBeenCalled();
			expect(onCancel).toHaveBeenCalledTimes(1);
			// And the row is removable again.
			act(() => ref.current!.pulseRemove(removeLine));
			expect(removePulses()).toHaveLength(2);
		});

		it('an add pulse during the tint tells the caller too', () => {
			const { ref } = renderRow();
			const onCancel = jest.fn();
			act(() => ref.current!.pulseRemove(jest.fn(), { onCancel }));
			act(() => ref.current!.pulseAdd());
			expect(onCancel).toHaveBeenCalledTimes(1);
		});

		it('keeps the row floor on the inner wrapper so the outer height can reach 0', () => {
			const { container } = renderRow();
			const row = container.firstElementChild as HTMLElement;
			expect(row.className).toMatch(/\bmin-h-0\b/);
			expect(row.className).not.toMatch(/\bmin-h-row\b/);
		});
	});
});
