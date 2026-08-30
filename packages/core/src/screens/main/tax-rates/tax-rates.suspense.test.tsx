/**
 * @jest-environment jsdom
 *
 * `TaxRates` built its binding and read it with `useObservableSuspense` in the SAME component,
 * and the modal's own `Suspense` (in `index.tsx`) sits ABOVE it — which is no help: React
 * unwinds TO the boundary and discards everything below, this component's resource included,
 * so every retry built another resource that suspended for the reason its predecessor did
 * (#1707). The fix is where the boundary sits, not a cache.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { Observable } from 'rxjs';

import { TaxRates } from './tax-rates';

let subscribes = 0;
let result$: Observable<{ hits: unknown[] }>;

/** Emits one microtask after each subscribe — the shape of an engine query's first value. */
const asyncRates = () =>
	new Observable<{ hits: unknown[] }>((subscriber) => {
		subscribes++;
		void Promise.resolve().then(() => subscriber.next({ hits: [] }));
	});

jest.mock('../../../query', () => ({
	useQueryState: () => ({}),
	// Faithful to the real binding at the one thing this file measures: the resource lives on
	// the FIBER (`useState`), so a render React discards takes it with it.
	useCollectionBinding: () => {
		const react = jest.requireActual('react') as typeof React;
		const hooks = jest.requireActual('observable-hooks');
		const [resource] = react.useState(() => new hooks.ObservableResource(result$));
		return {
			resource,
			active$: new Observable(() => undefined),
			total$: new Observable(() => undefined),
			sync: jest.fn(),
		};
	},
}));
jest.mock('@wcpos/query', () => ({ useDocField: () => [{ name: 'Standard', slug: '' }] }));
jest.mock('../contexts/extra-data', () => ({ useExtraData: () => ({ extraData: {} }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./footer', () => ({ TaxRatesFooter: () => <div data-testid="tax-rates-footer" /> }));
jest.mock('./rate-table', () => ({ TaxRateTable: () => <div data-testid="tax-rate-table" /> }));

function passthrough({ children }: { children?: React.ReactNode }) {
	return <div>{children}</div>;
}
jest.mock('@wcpos/components/modal', () => ({
	Modal: passthrough,
	ModalBody: passthrough,
	ModalClose: passthrough,
	ModalContent: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="tax-rates-modal">{children}</div>
	),
	ModalFooter: passthrough,
	ModalHeader: passthrough,
	ModalTitle: passthrough,
}));
jest.mock('@wcpos/components/tabs', () => ({
	Tabs: passthrough,
	TabsContent: passthrough,
	TabsTrigger: passthrough,
	ScrollableTabsList: passthrough,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

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

describe('the tax rates modal', () => {
	it('mounts on the first emission, having subscribed the rates exactly once', async () => {
		render(
			<React.Suspense fallback={<div data-testid="modal-fallback" />}>
				<TaxRates />
			</React.Suspense>
		);
		await settle();

		expect(await screen.findByTestId('tax-rates-modal')).toBeTruthy();
		expect(subscribes).toBe(1);
	});
});
