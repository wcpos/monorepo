import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { FallbackScreen } from './fallback-screen';

// GateScreen's geometry is covered in gate-screen/index.test.tsx; this stand-in shows the props.
jest.mock('../gate-screen', () => ({
	GateScreen: ({
		testID,
		tone,
		title,
		detail,
		primary,
	}: {
		testID: string;
		tone: string;
		title: string;
		detail: string;
		primary: { label: string; onPress: () => void; testID: string };
	}) => (
		<div data-testid={testID} data-tone={tone}>
			<h1>{title}</h1>
			<pre data-testid="detail">{detail}</pre>
			<button data-testid={primary.testID} onClick={primary.onPress}>
				{primary.label}
			</button>
		</div>
	),
}));

it('replaces the route with a bad gate whose one action resets the boundary', () => {
	const resetErrorBoundary = jest.fn();
	render(<FallbackScreen error={new Error('boom')} resetErrorBoundary={resetErrorBoundary} />);
	expect(screen.getByTestId('error-boundary-screen')).toHaveAttribute('data-tone', 'bad');
	expect(screen.getByRole('heading')).toHaveTextContent('Something went wrong');
	expect(screen.getByTestId('detail')).toHaveTextContent('boom');
	fireEvent.click(screen.getByTestId('error-boundary-retry'));
	expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
});

it('clips a long or non-Error throw to one 300-character line', () => {
	render(<FallbackScreen error={'x'.repeat(1000)} resetErrorBoundary={jest.fn()} />);
	const detail = screen.getByTestId('detail').textContent!;
	expect(detail).toHaveLength(300);
	expect(detail.endsWith('…')).toBe(true);
});
