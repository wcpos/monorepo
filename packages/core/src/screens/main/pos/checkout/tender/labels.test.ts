import { createTestT } from '../../../../../../jest/translate';
import { describeEvent, failureReasonLabel } from './labels';

const t = createTestT();
const context = { readerLabel: 'Paul Solo', failureReason: null };
const info = (message: string) => ({ message, level: 'info' as const });

// Every line Pro's Event_Log and the leg controllers write, as the cashier reads it. The ids a
// message carried go to the detail line, never into the words (roadmap docs/prototypes/2026-10-05).
it.each([
	[
		'Reader action rdr_20XY:4297f22d created on rdr_20XY',
		'Sent to Paul Solo',
		'ok',
		'rdr_20XY:4297f22d',
	],
	['Payment intent pi_1 created', 'Sent to Paul Solo', 'ok', 'pi_1'],
	['Reader action pending', 'On the terminal, waiting for the customer', 'ok', null],
	['Reader action in_progress', 'On the terminal, waiting for the customer', 'ok', null],
	['Reader action voided', 'Terminal confirmed the cancel', 'muted', null],
	['Reader action voided: expired', 'Terminal confirmed the cancel', 'muted', null],
	['Payment intent voided: cashier', 'Terminal confirmed the cancel', 'muted', null],
	['Reader action cancelled', 'Cancelled on the terminal', 'error', null],
	['Reader action failed: card_declined', 'Card declined', 'error', null],
	['Cancel requested by cashier', 'Cancelled from the till', 'void', null],
	['Cancel requested: cashier', 'Cancelled from the till', 'void', null],
	['Cancel requested: expired', 'Timed out after 5 minutes', 'void', null],
	['Deadline reached', 'Timed out after 5 minutes', 'void', null],
	['Cancel requested: order_cancelled', 'Cancel requested', 'void', 'order_cancelled'],
	[
		'Capture failed: amount_mismatch',
		'Authorised, not captured: The terminal confirmed a different amount',
		'error',
		null,
	],
	[
		'Ignored stale cancelled after captured',
		'Late update ignored',
		'muted',
		'cancelled → captured',
	],
	['Connection unstable', 'Connection unstable, still trying', 'warning', null],
	['Leg released', 'Payment released: check the terminal before taking it again', 'warning', null],
	['Reader session was lost', 'Reader session was lost', 'error', null],
	['Offline leg recorded on device', 'Recorded offline', 'ok', null],
])('describes %j', (message, text, tone, detail) => {
	expect(describeEvent(info(message), t, context)).toEqual({ text, tone, detail });
});

it('formats the approved amount in the till currency and leaves a foreign one as written', () => {
	const formatAmount = (amount: string, currency: string) =>
		currency === 'EUR' ? `${amount.replace('.', ',')} €` : null;
	expect(describeEvent(info('Approved 1.00 EUR'), t, { ...context, formatAmount }).text).toBe(
		'Approved 1,00 €'
	);
	expect(describeEvent(info('Approved 1.00 GBP'), t, { ...context, formatAmount }).text).toBe(
		'Approved 1.00 GBP'
	);
});

// SumUp reports a decline and a cancel on the reader the same way; the row's reason says so and
// the cancelled line must not read it back as a cancel.
it("names the leg's own reason for a code-less refusal", () => {
	expect(failureReasonLabel('refused', t)).toBe('The store refused this payment');
});

it('reads a cancelled line through the row failure reason', () => {
	expect(
		describeEvent(info('Reader action cancelled'), t, {
			...context,
			failureReason: 'declined_or_cancelled',
		}).text
	).toBe('Declined or cancelled on the terminal');
	expect(failureReasonLabel('declined_or_cancelled', t)).toBe(
		'Declined or cancelled on the terminal'
	);
});

it('passes an unknown message through at its own level', () => {
	expect(describeEvent({ message: 'Something new', level: 'warning' }, t, context)).toEqual({
		text: 'Something new',
		tone: 'warning',
		detail: null,
	});
	expect(describeEvent({ message: 'Something new', level: 'error' }, t, context).tone).toBe(
		'error'
	);
});
