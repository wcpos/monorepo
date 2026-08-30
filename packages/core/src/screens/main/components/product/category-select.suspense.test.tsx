/**
 * @jest-environment jsdom
 *
 * `CategoryTreeLoaderInner` built its categories binding and read it with
 * `useObservableSuspense`, INSIDE the `Suspense` that `CategoryTreeLoader` puts around it. A
 * boundary above the creator is no help: React unwinds to it and discards everything below,
 * the resource included, so every retry built another one that suspended for the reason its
 * predecessor did (#1707). Moving the creation up one level — above the boundary — is the whole
 * fix; there is no cache here.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { Observable } from 'rxjs';

import { CategoryTreeLoader } from './category-select';

let subscribes = 0;
let result$: Observable<{ hits: unknown[] }>;

/** Emits one microtask after each subscribe — the shape of an engine query's first value. */
const asyncCategories = () =>
	new Observable<{ hits: unknown[] }>((subscriber) => {
		subscribes++;
		void Promise.resolve().then(() => subscriber.next({ hits: [] }));
	});

// The combobox pulls in @rn-primitives/popover, which ships untransformed JSX. Nothing this
// file measures renders it — CategoryTreeLoader returns null.
jest.mock('@wcpos/components/combobox', () => ({
	Combobox: () => null,
	ComboboxContent: () => null,
	ComboboxEmpty: () => null,
	ComboboxInput: () => null,
	ComboboxItem: () => null,
	ComboboxItemText: () => null,
	ComboboxList: () => null,
	ComboboxTrigger: () => null,
	ComboboxValue: () => null,
}));
jest.mock('@wcpos/core/contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../query', () => ({
	useGuardedExtension: () => ({}),
	useSearchSelect: () => ({}),
	// Faithful to the real binding at the one thing this file measures: the resource lives on
	// the FIBER (`useState`), so a render React discards takes it with it.
	useAllCategoriesBinding: () => {
		const react = jest.requireActual('react') as typeof React;
		const hooks = jest.requireActual('observable-hooks');
		const [resource] = react.useState(() => new hooks.ObservableResource(result$));
		return { resource };
	},
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
	result$ = asyncCategories();
});

describe('the category tree loader', () => {
	it('hands its options over on the first emission, having subscribed exactly once', async () => {
		const loaded: unknown[][] = [];
		render(<CategoryTreeLoader onOptionsLoaded={(options) => loaded.push(options)} />);
		await settle();

		expect(loaded.length).toBeGreaterThan(0);
		// One subscription across every attempt: the retry read back the resource the first
		// attempt already had in flight, because the creator committed with the fallback.
		expect(subscribes).toBe(1);
	});

	it('keeps its own boundary between the creator and the reader', async () => {
		// A source that never emits: the reader stays suspended forever, and nothing outside
		// `CategoryTreeLoader` may notice.
		result$ = new Observable<{ hits: unknown[] }>(() => {
			subscribes++;
		});
		render(
			<React.Suspense fallback={<div data-testid="route-fallback" />}>
				<div data-testid="sibling" />
				<CategoryTreeLoader onOptionsLoaded={() => undefined} />
			</React.Suspense>
		);
		await settle();

		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('sibling')).toBeTruthy();
		expect(subscribes).toBe(1);
	});
});
