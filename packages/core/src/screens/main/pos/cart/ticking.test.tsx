/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { Ticking } from './ticking';

// The clock hook's module also exports a translated formatter; its real import drags ESM uuid.
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

afterEach(() => {
	jest.useRealTimers();
});

it('re-renders only its child on the clock; the parent never ticks', () => {
	jest.useFakeTimers({ now: new Date('2026-11-01T10:00:00Z') });
	const parentRendered = jest.fn();
	function Parent() {
		parentRendered();
		return (
			<Ticking>{(nowMs) => <span data-testid="now">{new Date(nowMs).toISOString()}</span>}</Ticking>
		);
	}
	render(<Parent />);
	expect(screen.getByTestId('now').textContent).toBe('2026-11-01T10:00:00.000Z');
	const before = parentRendered.mock.calls.length;

	act(() => {
		jest.advanceTimersByTime(60_000);
	});

	expect(screen.getByTestId('now').textContent).toBe('2026-11-01T10:01:00.000Z');
	expect(parentRendered).toHaveBeenCalledTimes(before);
});
