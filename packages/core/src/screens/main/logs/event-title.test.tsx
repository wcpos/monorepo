/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { EVENT_LABELS } from '@wcpos/utils/logger/generated/event-labels.generated';

import { createTestT } from '../../../../jest/translate';
import { useEventTitle } from './event-title';
import { translateEventDescription, translateEventTitle } from './generated/event-titles.generated';

import type { LogRow } from './logs-logic';

/**
 * Stand-in for the till's current locale: a translated string comes back marked
 * with its key, so a title that went through `t()` is distinguishable from one
 * that leaked a persisted English string or a raw event code.
 */
const translated = (key: string) => `[es] ${key}`;

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

		expect(title).toBe('[es] health.logs.event.queue_scheduler_drain');
		expect(title).not.toContain(EVENT_LABELS['queue.scheduler.drain'].label);
	});

	it('never shows a raw dotted code as the title of a registered event', () => {
		for (const type of Object.keys(EVENT_LABELS)) {
			expect(titleFor(row({ context: { type } }))).not.toMatch(/^[a-z][a-z0-9_-]*\./);
		}
	});

	// The store may run in any language: the online-status rows persist forensic
	// English (#1150) and MUST title through the translation on a Spanish till.
	it('translates the connectivity rows, not their persisted English message', () => {
		const title = titleFor(
			row({
				message: 'Website is unreachable',
				context: { type: 'connectivity.website-unreachable' },
			})
		);

		expect(title).toBe('[es] health.logs.event.connectivity_website_unreachable');
	});

	it('prefers the translation over the English string a past build persisted', () => {
		const title = titleFor(
			row({
				message: 'change-signal: checked for updates (0 changed, 0 deleted)',
				context: { type: 'signal.cycle' },
			})
		);

		expect(title).toBe('[es] health.logs.event.signal_cycle');
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

	// The observer persists `message: ''` rather than substituting, so an empty
	// message is a real row shape — and `??` would let it render as a blank title.
	it('falls through an empty message to the raw code', () => {
		expect(titleFor(row({ message: '', context: { type: 'checkout.settled' } }))).toBe(
			'checkout.settled'
		);
		expect(titleFor(row({ message: '   ', context: { type: 'checkout.settled' } }))).toBe(
			'checkout.settled'
		);
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

describe('translateEventDescription', () => {
	it('describes an escalation as local divergence, not a failed store update', () => {
		expect(translateEventTitle(createTestT(), 'apply.escalation')).toBe(
			'A record on this device does not match your store'
		);
	});

	it('round-trips a described event through the English catalogue', () => {
		expect(translateEventDescription(createTestT(), 'apply.pull')).toBe(
			'Updates made in your store were saved to this device.'
		);
	});

	it('returns undefined for an event without a description', () => {
		expect(translateEventDescription(createTestT(), 'apply.escalation')).toBeUndefined();
	});
});
