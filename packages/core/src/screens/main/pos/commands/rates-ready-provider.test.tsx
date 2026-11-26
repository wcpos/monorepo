/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject, type Observable, Subject } from 'rxjs';

import { RatesReadyProvider, useRatesReady } from './rates-ready-provider';

import type { RatesReady } from './settlement-coordinator';

const subscribe = (source: Subject<any>) => (fn: any) => {
	const subscription = source.subscribe(fn);
	return () => subscription.unsubscribe();
};
// One fake engine per store or site: its own events, coverage generation and coverage verdict.
const makeEngine = (complete: boolean) => {
	const events = new Subject<{ type: string }>();
	const statuses = new BehaviorSubject({ collections: { taxRates: { coverageGeneration: 0 } } });
	const coverage = new BehaviorSubject({ complete });
	return {
		events: subscribe(events),
		status: () => statuses.value,
		statusChanges: subscribe(statuses),
		emit: (type: string) => events.next({ type }),
		bump: (generation: number) =>
			statuses.next({ collections: { taxRates: { coverageGeneration: generation } } }),
		coverage,
	};
};
const manager = { engine: makeEngine(true) };
jest.mock('@wcpos/query', () => ({
	readCoverageGeneration: jest.requireActual('@wcpos/query').readCoverageGeneration,
	observeCoverage: (engine: { coverage: Observable<unknown> }) => engine.coverage,
	useQueryRuntime: () => manager,
}));
jest.mock('../../contexts/tax-rates', () => ({ useTaxSettings: () => ({ ratesRead: true }) }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

let seen: ReturnType<typeof useRatesReady>;
function Probe() {
	const value = useRatesReady();
	React.useLayoutEffect(() => {
		seen = value;
	});
	return null;
}
const ready = () => {
	let value: RatesReady | undefined;
	seen.subscribe((next) => (value = next))();
	return value?.ready;
};
const wait = (key: string) => {
	const outcome: { value: boolean | 'pending' } = { value: 'pending' };
	void seen.whenReady(key).then((value) => (outcome.value = value));
	return outcome;
};
const flush = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

it('T6: a site switch (a new engine) reports the new engine not ready, never the old one ready', async () => {
	const a = makeEngine(true);
	manager.engine = a;
	const view = render(
		<RatesReadyProvider>
			<Probe />
		</RatesReadyProvider>
	);
	expect(ready()).toBe(true);
	const b = makeEngine(false);
	manager.engine = b;
	view.rerender(
		<RatesReadyProvider>
			<Probe />
		</RatesReadyProvider>
	);
	expect(ready()).toBe(false);
	const pick = wait('order');
	await flush();
	expect(pick.value).toBe('pending');
	await act(async () => b.coverage.next({ complete: true }));
	await flush();
	expect(pick.value).toBe(true);
});

it('T6b: a store switch on one engine shuts readiness until the new generation lands', async () => {
	const engine = makeEngine(true);
	manager.engine = engine;
	render(
		<RatesReadyProvider>
			<Probe />
		</RatesReadyProvider>
	);
	expect(ready()).toBe(true);
	let pick!: ReturnType<typeof wait>;
	await act(async () => {
		// The engine bumps the generation and announces the switch before the store's rates arrive.
		engine.emit('scope-switched');
		pick = wait('order');
		engine.bump(1);
		engine.coverage.next({ complete: false });
	});
	await flush();
	expect(ready()).toBe(false);
	expect(pick.value).toBe('pending');
	await act(async () => engine.coverage.next({ complete: true }));
	await flush();
	expect(ready()).toBe(true);
	expect(pick.value).toBe(true);
});
