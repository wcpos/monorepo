/**
 * @jest-environment jsdom
 *
 * #1707 on the handle: the OWNER (`TaxSettingsProvider`) acquires the tax-rates handle and
 * retains it from an effect, above the `Suspense` its reader (`TaxSettingsFromRates`) suspends
 * on. An owner that also read would suspend uncommitted: nothing would retain the handle, the
 * read would never start, `whenAnswered()` would never settle, and the fallback would never
 * leave. The nearest boundary above is the route's, whose PRODUCTION fallback is `null`: a
 * blank POS body under a painted header.
 *
 * The mock hook is faithful to `useCollectionQueryHandle` where this file measures: the handle
 * is memoised on the fiber, joins the by-key registry only once retained (the real one claims
 * the key on start) and leaves it on the last release, and its read starts on that retain.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { Observable } from 'rxjs';

import { TaxRatesProvider } from './provider';

type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
	retained: number;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>, key?: string) => FakeHandle;
};

let mockCreated: FakeHandle[] = [];
let mockRegistry = new Map<string, FakeHandle>();
/** Whether a started read answers; off for the still-loading case. */
let mockAnswers = true;

/** One handle per key while retained; a handle never retained never joined the registry. */
function mockAcquire(key: string): FakeHandle {
	const live = mockRegistry.get(key);
	if (live) return live;
	const handle = fakeQueryHandle({ ready: false }, key);
	mockCreated.push(handle);
	const retain = handle.retain;
	handle.retain = () => {
		mockRegistry.set(key, handle);
		const release = retain();
		const leave = () => {
			release();
			if (handle.retained === 0 && mockRegistry.get(key) === handle) mockRegistry.delete(key);
		};
		// The owner's retain starts the read; its first answer is one microtask later.
		if (mockAnswers) {
			void Promise.resolve().then(() => handle.set({ ready: true, result: { hits: [] } }));
		}
		return leave;
	};
	return handle;
}

const store = {
	calc_taxes$: new Observable(() => undefined),
	prices_include_tax$: new Observable(() => undefined),
	tax_round_at_subtotal$: new Observable(() => undefined),
};

jest.mock('../../../../query', () => ({
	...jest.requireActual('../../../../query'),
	QueryStateProvider: ({ children }: { children: React.ReactNode }) => children,
	useQueryState: () => ({}),
	useCollectionQueryHandle: (_collection: unknown, state: unknown) => {
		const key = JSON.stringify(state);
		const handle = React.useMemo(() => mockAcquire(key), [key]);
		React.useEffect(() => handle.retain(), [handle]);
		return handle;
	},
}));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: () => undefined,
	useRecordField: () => undefined,
}));
jest.mock('@wcpos/sync-core', () => ({
	...jest.requireActual('@wcpos/sync-core'),
	wooMetaCarrier: { readIdentity: () => ({}), taxBasedOnOverride: () => undefined },
}));
// The real boundary without the app's fallback (whose icon pulls in the styling runtime).
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
			<ErrorBoundary fallback={<div data-testid="tax-settings-error" />}>{children}</ErrorBoundary>
		),
	};
});
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ store }) }));
jest.mock('../../hooks/use-base-tax-location', () => ({
	useBaseTaxLocation: () => ({ country: 'GB', state: '', city: '', postcode: '' }),
}));
jest.mock('../../pos/contexts/current-order/context', () => ({
	useCurrentOrderOptional: () => undefined,
}));
jest.mock('observable-hooks', () => {
	const actual = jest.requireActual('observable-hooks');
	return {
		...actual,
		// The tax settings read three store fields eagerly; none of them is what this file is
		// about, and their observables never emit here.
		useObservableEagerState: () => false,
	};
});

/** Lets every pending microtask (and the React retry it schedules) run. */
async function settle() {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
}

beforeEach(() => {
	mockCreated = [];
	mockRegistry = new Map();
	mockAnswers = true;
});

describe('the tax settings provider', () => {
	it('mounts its children on the first answer, having acquired and retained the rates once', async () => {
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<TaxRatesProvider>
					<div data-testid="pos-body" />
				</TaxRatesProvider>
			</React.Suspense>
		);
		await settle();

		expect(await screen.findByTestId('pos-body')).toBeTruthy();
		// The instruments: one handle for the stable key, held by the owner's one retain.
		expect(mockCreated).toHaveLength(1);
		expect(mockCreated[0]?.retained).toBe(1);
	});

	it('does not escape to the route boundary while the rates are still loading', async () => {
		// The suspension has to cost the provider's own fallback, never the screen: escaping to
		// expo-router's per-route boundary, whose production fallback is `null`, is how a
		// waiting query became a blank body.
		mockAnswers = false;
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<TaxRatesProvider>
					<div data-testid="pos-body" />
				</TaxRatesProvider>
			</React.Suspense>
		);
		await settle();

		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.queryByTestId('pos-body')).toBeNull();
		// The owner committed beside the fallback and holds the one handle while it waits.
		expect(mockCreated).toHaveLength(1);
		expect(mockCreated[0]?.retained).toBe(1);
	});
});
