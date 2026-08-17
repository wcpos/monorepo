/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, waitFor } from '@testing-library/react';
import { BehaviorSubject, throwError } from 'rxjs';

import { useUnresolvedConflicts } from './use-unresolved-conflicts';

let engineStub: unknown;

jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	resolveLegacyField: jest.requireActual('@wcpos/query').resolveLegacyField,
	useQueryRuntime: () => ({ engine: engineStub }),
}));

const UUID_A = '070ef836-0d14-4109-ac2b-c35a96b2d1c6';

function makeEngine({
	collectionName = 'orders',
	operation = 'create',
	resident = { remoteId: null, number: '1042', total: '25.00' },
	failFirstQuery = false,
}: {
	collectionName?: string;
	operation?: 'create' | 'update' | 'delete';
	resident?: Record<string, unknown> | null;
	failFirstQuery?: boolean;
} = {}) {
	let subscriptions = 0;
	const heldRow = {
		mutationId: '29956306-c66c-4d4e-a3cd-753440de79b1',
		collectionName,
		operation,
		recordId: UUID_A,
		origin: 'existing' as const,
		payload: { status: 'pos-open' },
		baseRevision: 'server-revision',
		queuedAt: '2026-08-14T16:30:00.000Z',
		status: 'conflicted' as const,
	};
	const rows$ = new BehaviorSubject<unknown[]>([{ toJSON: () => heldRow }]);
	const database = {
		collections: {
			recordMutations: {
				find: () => ({
					get $() {
						subscriptions += 1;
						return failFirstQuery && subscriptions === 1
							? throwError(() => new Error('storage query failed'))
							: rows$.asObservable();
					},
				}),
			},
			[collectionName]: {
				findOne: () => ({
					exec: () => Promise.resolve(resident === null ? null : { toJSON: () => resident }),
				}),
			},
		},
	};
	const engine = {
		db$: (callback: (database: unknown) => void) => {
			callback(database);
			return () => undefined;
		},
		active: () => ({ database }),
	};
	return { engine, subscriptions: () => subscriptions };
}

function Probe() {
	const { rows, readError } = useUnresolvedConflicts();
	if (readError) return <div data-testid="result">READ-ERROR</div>;
	const row = rows[0];
	return (
		<div data-testid="result">
			{row?.residentUnknown
				? 'UNKNOWN'
				: row?.destroysRecord
					? 'DESTROYS'
					: row?.mayDestroyRecord
						? 'MAY-DESTROY'
						: 'RESTORES'}
		</div>
	);
}

function renderProbe() {
	return render(
		<React.Suspense fallback={<div data-testid="spinner">loading</div>}>
			<Probe />
		</React.Suspense>
	);
}

describe('useUnresolvedConflicts', () => {
	it('resubscribes after a transient query failure and identifies a destructive order create', async () => {
		const { engine, subscriptions } = makeEngine({ failFirstQuery: true });
		engineStub = engine;

		const first = renderProbe();
		await waitFor(() => expect(first.getByTestId('result').textContent).toBe('READ-ERROR'));
		first.unmount();

		const second = renderProbe();
		await waitFor(() => expect(second.getByTestId('result').textContent).toBe('DESTROYS'));
		expect(subscriptions()).toBe(2);
	});

	it('marks a non-order resident with a server identity as possibly destructive', async () => {
		const { engine } = makeEngine({
			collectionName: 'products',
			operation: 'update',
			resident: { remoteId: '501', name: 'Aether Gym Pant' },
		});
		engineStub = engine;

		const screen = renderProbe();
		await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('MAY-DESTROY'));
	});
});
