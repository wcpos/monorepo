/** @jest-environment jsdom */
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { serialize } from 'node:v8';

import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { keptCount, RefusedCloseNotice } from './refused-close-notice';

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({
		description,
		actions,
	}: {
		description?: string;
		actions?: { label: string; testID: string; onPress: () => void }[];
	}) => (
		<>
			{description && <p data-testid="description">{description}</p>}
			{actions?.map(({ label, testID, onPress }) => (
				<button key={testID} data-testid={testID} onClick={onPress}>
					{label}
				</button>
			))}
		</>
	),
}));

Object.assign(globalThis, { TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

let db: RxDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `refused${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	await db.addCollections({
		sessions: {
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 36 },
					counted: { type: 'object' },
					count_note: { type: ['string', 'null'] },
					count_denominations: { type: ['array', 'null'] },
				},
				required: ['id'],
			},
		},
	});
});
afterEach(() => db.remove());

// The live till (#2016): the session document read from the store, counting with its count, and
// a closure row of the same id. The count pane sends what keptCount gives it to the storage
// worker by postMessage, which clones as v8.serialize does and refuses an RxDB Proxy
// (DataCloneError).
it('keeps the count of a session document as a close the storage worker can clone', async () => {
	const session = await db.sessions.insert({ id: 's', counted: { cash: '40.00' } });
	const closure = {
		id: 's',
		counted: { cash: '40.00' },
		breakdowns: {
			variance_note: 'Short',
			denominations: [{ value: '20', pieces: 2, amount: '40' }],
		},
	};
	const kept = keptCount(session, closure);
	expect(() => serialize(kept)).not.toThrow();
	expect(kept).toEqual({
		counted: { cash: '40.00' },
		note: 'Short',
		denominations: [{ value: '20', pieces: 2 }],
	});
});

it('offers Retry only when given one', () => {
	const onRetry = jest.fn();
	const view = render(<RefusedCloseNotice />);
	expect(screen.queryByTestId('register-panel-retry-close')).toBeNull();
	view.rerender(<RefusedCloseNotice onRetry={onRetry} />);
	fireEvent.click(screen.getByTestId('register-panel-retry-close'));
	expect(screen.getByTestId('register-panel-retry-close').textContent).toBe('register.retry');
	expect(onRetry).toHaveBeenCalledTimes(1);
});

it('is the one line, with no description under it', () => {
	render(<RefusedCloseNotice onRetry={jest.fn()} />);
	expect(screen.queryByTestId('description')).toBeNull();
});

it('takes the count from the closure row when the session has none', async () => {
	const session = await db.sessions.insert({ id: 's', counted: {} });
	const kept = keptCount(session, { id: 's', counted: { cash: '40.00' } });
	expect(() => serialize(kept)).not.toThrow();
	expect(kept).toEqual({ counted: { cash: '40.00' }, note: '', denominations: [] });
});

// An interrupted retry (#3302): closeSession saved the corrected count, note and denominations
// on the session; writeClosure never rewrote the closure row.
const staleClosure = () => ({
	id: 's',
	counted: { cash: '40.00' },
	breakdowns: { variance_note: 'Short', denominations: [{ value: '20', pieces: 2 }] },
});
it('keptCount prefers the corrected note and denominations an interrupted retry saved', async () => {
	const session = await db.sessions.insert({
		id: 's',
		counted: { cash: '60.00' },
		count_note: 'Found a twenty',
		count_denominations: [{ value: '20', pieces: 3 }],
	});
	const kept = keptCount(session, staleClosure());
	expect(() => serialize(kept)).not.toThrow();
	expect(kept).toEqual({
		counted: { cash: '60.00' },
		note: 'Found a twenty',
		denominations: [{ value: '20', pieces: 3 }],
	});
	const denominations = [{ value: '20', pieces: 3 }];
	const corrected = { id: 's', counted: { cash: '60.00' }, count_denominations: denominations };
	const plain = keptCount(corrected, staleClosure());
	expect(plain.denominations).toEqual(denominations);
	expect(plain.denominations).not.toBe(denominations);
});
it.each([
	['emptied', '', []],
	['cleared', null, null],
])(
	'keptCount falls back to the closure row for an %s note and denominations',
	(_, note, pieces) => {
		const closure = staleClosure();
		const emptied = {
			id: 's',
			counted: { cash: '40.00' },
			count_note: note,
			count_denominations: pieces,
		};
		const kept = keptCount(emptied, closure);
		expect(kept).toEqual({
			counted: { cash: '40.00' },
			note: 'Short',
			denominations: [{ value: '20', pieces: 2 }],
		});
		expect(kept.denominations).not.toBe(closure.breakdowns.denominations);
	}
);
