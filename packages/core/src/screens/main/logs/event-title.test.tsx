/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { EVENT_LABELS } from '@wcpos/utils/logger/generated/event-labels.generated';

import { useEventTitle } from './event-title';

import type { LogRow } from './logs-logic';

/**
 * Stand-in for the till's current locale: every translated string comes back
 * prefixed, so a title that went through `t()` is distinguishable from one that
 * leaked a persisted English string or a raw event code.
 */
const translated = (key: string, options: { defaultValue: string }) =>
	`[es] ${key}::${options.defaultValue}`;

jest.mock('../../../contexts/translations', () => ({
	useT: () => translated,
}));

const row = (overrides: Partial<LogRow>): LogRow => ({
	logId: 'log-1',
	timestamp: 1_000,
	...overrides,
});

const titleFor = (input: LogRow): string => renderHook(() => useEventTitle()).result.current(input);

describe('useEventTitle', () => {
	it('translates a registered event code at render time', () => {
		const title = titleFor(row({ context: { type: 'queue.scheduler.drain' } }));

		expect(title).toBe(
			`[es] health.logs.event.queue_scheduler_drain::${EVENT_LABELS['queue.scheduler.drain'].label}`
		);
	});

	it('never shows a raw dotted code as the title of a registered event', () => {
		for (const type of Object.keys(EVENT_LABELS)) {
			expect(titleFor(row({ context: { type } }))).not.toMatch(/^[a-z][a-z0-9_-]*\./);
		}
	});

	it('prefers the translation over the English string a past build persisted', () => {
		const title = titleFor(
			row({
				message: 'change-signal: checked for updates (0 changed, 0 deleted)',
				context: { type: 'signal.cycle' },
			})
		);

		expect(title).toBe(
			`[es] health.logs.event.signal_cycle::${EVENT_LABELS['signal.cycle'].label}`
		);
	});

	it('falls back to the persisted message for an event type it does not know', () => {
		const title = titleFor(
			row({ message: 'checkout finished', context: { type: 'checkout.settled' } })
		);

		expect(title).toBe('checkout finished');
	});

	it('falls back to the raw code when an unknown event type has no message', () => {
		expect(titleFor(row({ context: { type: 'checkout.settled' } }))).toBe('checkout.settled');
	});

	it('leaves rows that carry no event type on their own message', () => {
		expect(titleFor(row({ message: 'Signed in', context: { actor: 'cashier' } }))).toBe(
			'Signed in'
		);
		expect(titleFor(row({ message: 'Signed in' }))).toBe('Signed in');
	});

	it('renders empty rather than blowing up on a row with neither', () => {
		expect(titleFor(row({}))).toBe('');
		expect(titleFor(row({ context: { type: 42 } }))).toBe('');
	});
});
