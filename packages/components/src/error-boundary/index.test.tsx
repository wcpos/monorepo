import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const mockError = jest.fn();

// The real logger pulls in react-native-logs and the toast pipeline; the
// boundary only needs `getLogger().error` and the exception mapper.
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: mockError }),
	mapExceptionToCode: jest.requireActual('@wcpos/utils/logger/map-exception').mapExceptionToCode,
}));

// The default fallback renders icons, tooltips and uniwind classes, none of
// which matter here.
jest.mock('./fallback', () => ({ Fallback: () => null }));

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the module under test.
import { ErrorBoundary } from './index';

function Fallback({ error }: { error: unknown }) {
	return <div data-testid="fallback">{error instanceof Error ? error.message : String(error)}</div>;
}

function Bomb({ payload }: { payload: unknown }): React.ReactElement {
	throw payload;
}

let consoleError: jest.SpyInstance;

beforeEach(() => {
	jest.clearAllMocks();
	// React reports every caught render error to console.error; it is expected here.
	consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
	it('reports a caught render error through the logger with the component stack', () => {
		const thrown = new Error('useStoreSession must be called within an active store session');

		render(
			<ErrorBoundary FallbackComponent={Fallback}>
				<Bomb payload={thrown} />
			</ErrorBoundary>
		);

		expect(screen.getByTestId('fallback')).toHaveTextContent(thrown.message);
		expect(mockError).toHaveBeenCalledTimes(1);
		const [message, options] = mockError.mock.calls[0];
		expect(message).toBe(`Render failed: ${thrown.message}`);
		expect(options.code).toBe(ERROR_CODES.SCREEN_RENDER_FAILED);
		expect(options.showToast).toBeUndefined();
		expect(options.context).toEqual(
			expect.objectContaining({
				type: 'render.error',
				error: thrown,
				errorName: 'Error',
				errorMessage: thrown.message,
				stack: thrown.stack,
			})
		);
		expect(options.context.componentStack).toEqual(expect.stringContaining('Bomb'));
	});

	it('keeps a recognised exception class on its own code', () => {
		render(
			<ErrorBoundary FallbackComponent={Fallback}>
				<Bomb payload={new RangeError('JavaScript heap out of memory')} />
			</ErrorBoundary>
		);

		expect(mockError).toHaveBeenCalledTimes(1);
		expect(mockError.mock.calls[0][1].code).toBe(ERROR_CODES.OUT_OF_MEMORY);
	});

	it('wraps a non-Error throw so Sentry still receives an exception', () => {
		render(
			<ErrorBoundary FallbackComponent={Fallback}>
				<Bomb payload="boom" />
			</ErrorBoundary>
		);

		expect(mockError).toHaveBeenCalledTimes(1);
		const [message, options] = mockError.mock.calls[0];
		expect(message).toBe('Render failed: boom');
		expect(options.context.error).toBeInstanceOf(Error);
		expect(options.context.errorMessage).toBe('boom');
	});

	it('still calls an onError the caller supplied', () => {
		const onError = jest.fn();
		const thrown = new Error('caller cares');

		render(
			<ErrorBoundary FallbackComponent={Fallback} onError={onError}>
				<Bomb payload={thrown} />
			</ErrorBoundary>
		);

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBe(thrown);
		expect(mockError).toHaveBeenCalledTimes(1);
	});
});
