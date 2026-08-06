/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { Subject } from 'rxjs';

import { useReceiptEmailQueueCollection } from './use-receipt-email-queue-collection';

let storeDB: unknown;

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ storeDB }),
}));

/** One process-wide reset subject, exactly as the reset-collection plugin has. */
const reset$ = new Subject<{ name: string; database?: unknown }>();

function makeDB(label: string) {
	const db: Record<string, unknown> = { reset$ };
	db.collections = { receipt_email_queue: { label } };
	return db;
}

/**
 * The hook returns an object, so the probe renders its identity as a label the
 * assertions can read back — a module-level write from a component would break
 * the react-compiler purity rule.
 */
function Probe() {
	const collection = useReceiptEmailQueueCollection();
	const label = (collection as { label?: string; name?: string } | undefined) ?? undefined;
	return <span data-testid="probe">{label ? (label.label ?? label.name ?? '?') : 'none'}</span>;
}

describe('useReceiptEmailQueueCollection', () => {
	it('follows the store database across a switch', () => {
		const storeA = makeDB('A');
		storeDB = storeA;
		const { rerender, getByTestId } = render(<Probe />);
		expect(getByTestId('probe').textContent).toBe('A');

		// The regression this guards: latching the collection on mount kept
		// serving store A after the switch, so B's queue never drained and B's new
		// emails were written into A's database.
		storeDB = makeDB('B');
		rerender(<Probe />);
		expect(getByTestId('probe').textContent).toBe('B');
	});

	it('adopts a reset of its own collection', () => {
		const storeA = makeDB('A');
		storeDB = storeA;
		const { getByTestId } = render(<Probe />);

		act(() => {
			reset$.next({ name: 'receipt_email_queue', database: storeA });
		});
		expect(getByTestId('probe').textContent).toBe('receipt_email_queue');
	});

	it('ignores a reset for another collection', () => {
		const storeA = makeDB('A');
		storeDB = storeA;
		const { getByTestId } = render(<Probe />);

		act(() => {
			reset$.next({ name: 'products', database: storeA });
		});
		expect(getByTestId('probe').textContent).toBe('A');
	});

	it('ignores a reset emitted by another open store scope', () => {
		const storeA = makeDB('A');
		storeDB = storeA;
		const { getByTestId } = render(<Probe />);

		// reset$ is shared process-wide, so a same-named collection resetting in a
		// different scope must not swap this one.
		act(() => {
			reset$.next({ name: 'receipt_email_queue', database: makeDB('B') });
		});
		expect(getByTestId('probe').textContent).toBe('A');
	});

	it('is undefined when there is no store database', () => {
		storeDB = undefined;
		const { getByTestId } = render(<Probe />);
		expect(getByTestId('probe').textContent).toBe('none');
	});
});
