import * as React from 'react';
import ErrorBoundary from './boundary';
import renderWithTheme from '../../../jest/render-with-theme';

const ErrorComponent = ({ withError }: { withError?: boolean }): null => {
	if (withError) throw new Error();
	return null;
};

jest.spyOn(console, 'error').mockImplementation(() => {});

describe('ErrorBoundary Component', () => {
	it('Should react to error', () => {
		const { queryByText } = renderWithTheme(
			<ErrorBoundary>
				<ErrorComponent />
			</ErrorBoundary>
		);

		const error = queryByText(/error/i);
		expect(error).toBeFalsy();
	});

	it('Should react to error', () => {
		const { getAllByText } = renderWithTheme(
			<ErrorBoundary>
				<ErrorComponent withError />
			</ErrorBoundary>
		);

		const error = getAllByText(/error/i);
		expect(error).toBeTruthy();
	});
});
