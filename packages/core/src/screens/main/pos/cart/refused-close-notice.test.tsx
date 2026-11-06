/** @jest-environment jsdom */
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { serialize } from 'node:v8';

import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { keptCount, RefusedCloseNotice } from './refused-close-notice';

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({ actions }: { actions: { label: string; testID: string; onPress: () => void }[] }) => (
		<>
			{actions.map(({ label, testID, onPress }) => (
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
				properties: { id: { type: 'string', maxLength: 36 }, counted: { type: 'object' } },
				required: ['id'],
			},
		},
	});
});
afterEach(() => db.remove());

// The live till (#2016): the session document read from the store, counting with its count, and
// a closure row of the same id. The storage worker receives the close by postMessage, which
// clones its input as v8.serialize does and refuses an RxDB Proxy (DataCloneError).
it('Retry on a session document sends a close the storage worker can clone', async () => {
	const session = await db.sessions.insert({ id: 's', counted: { cash: '40.00' } });
	const closure = {
		id: 's',
		counted: { cash: '40.00' },
		breakdowns: {
			variance_note: 'Short',
			denominations: [{ value: '20', pieces: 2, amount: '40' }],
		},
	};
	const sent: unknown[] = [];
	const closeSession = jest.fn(async (input: unknown) => sent.push(serialize(input)));
	const failed = jest.fn();
	const attempt = (action: () => Promise<unknown>) => action().catch(failed);
	render(
		<RefusedCloseNotice
			session={session}
			closure={closure}
			closeSession={closeSession}
			attempt={attempt}
		/>
	);
	await act(async () => fireEvent.click(screen.getByTestId('register-panel-retry-close')));
	expect(failed).not.toHaveBeenCalled();
	expect(sent).toHaveLength(1);
	expect(closeSession).toHaveBeenCalledWith({
		counted: { cash: '40.00' },
		note: 'Short',
		denominations: [{ value: '20', pieces: 2 }],
	});
});

it('takes the count from the closure row when the session has none', async () => {
	const session = await db.sessions.insert({ id: 's', counted: {} });
	const kept = keptCount(session, { id: 's', counted: { cash: '40.00' } });
	expect(() => serialize(kept)).not.toThrow();
	expect(kept).toEqual({ counted: { cash: '40.00' }, note: '', denominations: [] });
});
