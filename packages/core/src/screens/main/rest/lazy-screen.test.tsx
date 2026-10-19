/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { lazyRest } from './lazy-screen';

const mockLoadRest = jest.fn();
let mockOnline = false;

jest.mock('@wcpos/core/screens/main/rest/lazy', () => ({ loadRest: () => mockLoadRest() }), {
	virtual: true,
});

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
	mockLoadRest.mockImplementation(() =>
		mockOnline
			? Promise.resolve({ OrdersScreen: () => <div data-testid="screen" /> })
			: Promise.reject(new Error('chunk'))
	);
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
	const Screen = lazyRest((rest) => rest.OrdersScreen);
	const { rerender } = render(
		<Boundary key="a">
			<React.Suspense fallback={null}>
				<Screen />
			</React.Suspense>
		</Boundary>
	);
	try {
		await screen.findByTestId('failed');
		mockOnline = true;
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
