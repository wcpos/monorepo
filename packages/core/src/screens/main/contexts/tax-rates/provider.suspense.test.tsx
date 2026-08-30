/**
 * @jest-environment jsdom
 *
 * `TaxSettingsProvider` built its tax-rates binding and read it with `useObservableSuspense` in
 * the SAME component. A resource built during render is discarded with the aborted render when
 * the component suspends before its subtree has ever committed, so every Suspense retry built
 * another one that suspended for exactly the reason its predecessor did — a loop, not a load
 * (#1707). A tax-rates query's first emission is always async, and the nearest boundary was the
 * per-route one, whose PRODUCTION fallback is `null`: a blank POS body under a painted header.
 *
 * The fix is the boundary, not a cache: the binding is built in `TaxSettingsProvider`, which
 * now renders the `Suspense` and the reader below it, so it commits alongside the fallback and
 * the retry reads back the resource the first attempt already subscribed.
 *
 * `packages/query/tests/suspense-boundary-placement.test.tsx` is the same claim without the app
 * around it.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { Observable } from 'rxjs';

import { TaxRatesProvider } from './provider';

let subscribes = 0;
let result$: Observable<{ hits: unknown[] }>;

/** Emits one microtask after each subscribe — the shape of an engine query's first value. */
const asyncRates = () =>
	new Observable<{ hits: unknown[] }>((subscriber) => {
		subscribes++;
		void Promise.resolve().then(() => subscriber.next({ hits: [] }));
	});

const store = {
	calc_taxes$: new Observable(() => undefined),
	prices_include_tax$: new Observable(() => undefined),
	tax_round_at_subtotal$: new Observable(() => undefined),
};

jest.mock('../../../../query', () => ({
	QueryStateProvider: ({ children }: { children: React.ReactNode }) => children,
	useQueryState: () => ({}),
	// Faithful to the real binding at the one thing this file measures: the resource lives on
	// the FIBER (`useState`), so a render React discards takes it with it and the next attempt
	// subscribes again. Caching it outside React here would hide the very loop under test.
	useCollectionBinding: () => {
		const react = jest.requireActual('react') as typeof React;
		const hooks = jest.requireActual('observable-hooks');
		const [resource] = react.useState(() => new hooks.ObservableResource(result$));
		return { result$, resource };
	},
}));
jest.mock('@wcpos/query', () => ({
	useDocField: () => undefined,
	useRecordField: () => undefined,
}));
jest.mock('@wcpos/sync-core', () => ({
	wooMetaCarrier: { readIdentity: () => ({}), taxBasedOnOverride: () => undefined },
}));
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
	subscribes = 0;
	result$ = asyncRates();
});

describe('the tax settings provider', () => {
	it('mounts its children on the first emission, having subscribed the rates once', async () => {
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<TaxRatesProvider>
					<div data-testid="pos-body" />
				</TaxRatesProvider>
			</React.Suspense>
		);
		await settle();

		expect(await screen.findByTestId('pos-body')).toBeTruthy();
		// The count is the instrument: one subscription means every retry read back the
		// resource the first attempt already had in flight, instead of building another.
		expect(subscribes).toBe(1);
	});

	it('does not escape to the route boundary while the rates are still loading', async () => {
		// The suspension has to cost the provider's own fallback, never the screen: escaping to
		// expo-router's per-route boundary, whose production fallback is `null`, is how a
		// waiting query became a blank body.
		result$ = new Observable<{ hits: unknown[] }>(() => {
			subscribes++;
		});
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
		expect(subscribes).toBe(1);
	});
});
