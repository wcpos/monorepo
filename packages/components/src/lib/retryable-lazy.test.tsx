/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { retryableLazy } from './retryable-lazy';

let online = false;
const load = jest.fn(() =>
	online
		? Promise.resolve({ default: () => <div data-testid="screen" /> })
		: Promise.reject(new Error('chunk'))
);

class Boundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	render() {
		return this.state.failed ? <div data-testid="failed" /> : this.props.children;
	}
}

it('loads again after a failed chunk once the boundary resets', async () => {
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
	const Screen = retryableLazy(load);
	const { rerender } = render(
		<Boundary key="a">
			<React.Suspense fallback={null}>
				<Screen />
			</React.Suspense>
		</Boundary>
	);
	try {
		await screen.findByTestId('failed');
		online = true;
		rerender(
			<Boundary key="b">
				<React.Suspense fallback={null}>
					<Screen />
				</React.Suspense>
			</Boundary>
		);
		await screen.findByTestId('screen');
	} finally {
		consoleError.mockRestore();
	}
});
