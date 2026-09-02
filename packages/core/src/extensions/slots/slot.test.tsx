/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { registerSlotEntry, resetSlotRegistry, type SlotEntryProps } from './registry';
import { createReadonlyView, Slot, useSlotValue, type SlotRenderedEntry } from './slot';

// The repo's ErrorBoundary IS react-error-boundary plus a rich fallback; the fallback drags
// in reanimated, which jsdom can't load. Keep the real containment, drop the chrome.
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary: Boundary } = jest.requireActual('react-error-boundary');
	const react = jest.requireActual('react');
	return {
		ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
			react.createElement(
				Boundary,
				{ fallbackRender: () => react.createElement('div', { 'data-testid': 'entry-error' }) },
				children
			),
	};
});

const SLOT = 'pos.products.filter-bar.item' as const;

const api = {
	setFilter: async () => undefined,
	clearFilter: async () => undefined,
	resetFilters: async () => undefined,
	setSearch: async () => undefined,
};

function makeStore(search: string) {
	let state = { search, filters: { categories: [], tags: [], brands: [] } };
	const listeners = new Set<() => void>();
	return {
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		setSearch(next: string) {
			state = { ...state, search: next };
			listeners.forEach((listener) => listener());
		},
	};
}

function registerLabel(id: string, order: number) {
	registerSlotEntry({
		id,
		slot: SLOT,
		order,
		title: id,
		capabilities: [],
		component: ({ entry }: SlotEntryProps<typeof SLOT>) => <div>{entry.id}</div>,
	});
}

describe('<Slot>', () => {
	const store = makeStore('');
	const view = createReadonlyView(store, (state) => state);

	beforeEach(() => resetSlotRegistry());
	afterEach(() => jest.restoreAllMocks());

	it('renders nothing when the slot is empty', () => {
		const { container } = render(<Slot id={SLOT} data={view} api={api} />);
		expect(container.innerHTML).toBe('');
	});

	it('renders entries in registry order', () => {
		registerLabel('second', 20);
		registerLabel('first', 10);

		const { container } = render(<Slot id={SLOT} data={view} api={api} />);
		expect(container.textContent).toBe('firstsecond');
	});

	it('hands the render prop ordered descriptors with their elements', () => {
		registerLabel('second', 20);
		registerLabel('first', 10);

		let received: SlotRenderedEntry[] = [];
		render(
			<Slot id={SLOT} data={view} api={api}>
				{(entries) => {
					received = entries;
					return <div>{entries.map((entry) => entry.element)}</div>;
				}}
			</Slot>
		);

		expect(received.map((entry) => entry.descriptor.id)).toEqual(['first', 'second']);
		expect(received.every((entry) => React.isValidElement(entry.element))).toBe(true);
	});

	it('contains a throwing entry in its own boundary while siblings render', () => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		registerSlotEntry({
			id: 'broken',
			slot: SLOT,
			order: 10,
			title: 'Broken',
			capabilities: [],
			component: () => {
				throw new Error('entry exploded');
			},
		});
		registerLabel('healthy', 20);

		render(<Slot id={SLOT} data={view} api={api} />);

		expect(screen.getByText('healthy')).toBeTruthy();
		expect(screen.getByTestId('entry-error')).toBeTruthy();
	});

	it('re-renders when an entry registers late', () => {
		const { container } = render(<Slot id={SLOT} data={view} api={api} />);
		expect(container.innerHTML).toBe('');

		act(() => registerLabel('late', 10));

		expect(container.textContent).toBe('late');
	});

	it('re-renders an entry when the view it subscribed to changes', () => {
		const liveStore = makeStore('shirt');
		const liveView = createReadonlyView(liveStore, (state) => state);
		registerSlotEntry({
			id: 'echo',
			slot: SLOT,
			order: 10,
			title: 'Echo',
			capabilities: [],
			component: ({ data }: SlotEntryProps<typeof SLOT>) => <div>{useSlotValue(data).search}</div>,
		});

		const { container } = render(<Slot id={SLOT} data={liveView} api={api} />);
		expect(container.textContent).toBe('shirt');

		act(() => liveStore.setSearch('hat'));
		expect(container.textContent).toBe('hat');
	});
});
