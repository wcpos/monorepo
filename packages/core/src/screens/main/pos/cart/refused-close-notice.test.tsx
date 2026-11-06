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
				properties: { id: { type: 'string', maxLength: 36 }, counted: { type: 'object' } },
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
	const view = render(<RefusedCloseNotice session={{ status: 'counting' }} />);
	expect(screen.queryByTestId('register-panel-retry-close')).toBeNull();
	view.rerender(<RefusedCloseNotice session={{ status: 'counting' }} onRetry={onRetry} />);
	fireEvent.click(screen.getByTestId('register-panel-retry-close'));
	expect(screen.getByTestId('register-panel-retry-close').textContent).toBe('register.retry');
	expect(onRetry).toHaveBeenCalledTimes(1);
});

it.each([
	[{ status: 'counting', sync_status: 'pending' }, true],
	[{ status: 'closed', sync_status: 'failed' }, true],
	[{ status: 'open', sync_status: 'failed' }, true],
	[{ status: 'open', sync_status: 'pending' }, false],
	[
		{ status: 'open', sync_status: 'pending', pending_status: 'open', server_status: 'counting' },
		true,
	],
	[
		{ status: 'open', sync_status: 'pending', pending_status: 'open', server_status: 'open' },
		false,
	],
])('for %j says sales are blocked: %s', (session, blocked) => {
	render(<RefusedCloseNotice session={session} />);
	expect(screen.queryByTestId('description')?.textContent ?? null).toBe(
		blocked ? 'register.close_refused_wait' : null
	);
});

it('takes the count from the closure row when the session has none', async () => {
	const session = await db.sessions.insert({ id: 's', counted: {} });
	const kept = keptCount(session, { id: 's', counted: { cash: '40.00' } });
	expect(() => serialize(kept)).not.toThrow();
	expect(kept).toEqual({ counted: { cash: '40.00' }, note: '', denominations: [] });
});
