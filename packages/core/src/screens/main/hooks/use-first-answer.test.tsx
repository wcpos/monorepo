/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { Subject } from 'rxjs';

import { useFirstAnswer } from './use-first-answer';

class Boundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		return this.state.error ? (
			<span data-testid="failed">{this.state.error.message}</span>
		) : (
			this.props.children
		);
	}
}
function Reader({ resource }: { resource: ObservableResource<string> }) {
	return <span data-testid="value">{useObservableSuspense(resource)}</span>;
}
function Pane({ resource }: { resource: ObservableResource<string> }) {
	const answered = useFirstAnswer(resource);
	if (!answered) return <span data-testid="skeleton" />;
	return (
		<React.Suspense fallback={<span data-testid="fallback" />}>
			<Reader resource={resource} />
		</React.Suspense>
	);
}
const mount = (input$: Subject<string>) =>
	render(
		<Boundary>
			<Pane resource={new ObservableResource(input$)} />
		</Boundary>
	);

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

it('holds the skeleton until the first value, then shows it without a fallback', async () => {
	const input$ = new Subject<string>();
	mount(input$);
	expect(screen.getByTestId('skeleton')).toBeTruthy();
	await act(async () => input$.next('order'));
	expect(screen.getByTestId('value').textContent).toBe('order');
});

it('a resource that fails before its first value reaches the error boundary', async () => {
	const input$ = new Subject<string>();
	mount(input$);
	await act(async () => input$.error(new Error('store closed')));
	expect(screen.getByTestId('failed').textContent).toBe('store closed');
	expect(screen.queryByTestId('skeleton')).toBeNull();
});

it('a resource that completes without a value reaches the error boundary', async () => {
	const input$ = new Subject<string>();
	mount(input$);
	await act(async () => input$.complete());
	expect(screen.getByTestId('failed')).toBeTruthy();
	expect(screen.queryByTestId('skeleton')).toBeNull();
});
