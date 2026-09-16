import * as React from 'react';

import { ErrorBoundary as Boundary, ErrorBoundaryPropsWithComponent } from 'react-error-boundary';

import { getLogger, mapExceptionToCode } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { Fallback as DefaultFallback } from './fallback';

type Props = Omit<React.PropsWithChildren<ErrorBoundaryPropsWithComponent>, 'FallbackComponent'> & {
	FallbackComponent?: React.ComponentType<any>;
};

const boundaryLogger = getLogger(['wcpos', 'app', 'error-boundary']);

/**
 * Every render-time throw the app catches lands here, whichever boundary
 * caught it. Until #2112 a caught throw was shown to the merchant and reported
 * nowhere: a till stuck at login on a boundary banner was invisible in Sentry
 * for 90 days. The logger's error sink reports it (with the merchant's consent)
 * and persists the row for the Logs screen; `type: 'render.error'` makes the
 * Sentry fingerprint the thrown message rather than the screen, so one bug
 * surfacing from several components is one issue.
 */
export function reportBoundaryError(error: unknown, info: React.ErrorInfo): void {
	// React lets a component throw anything; Sentry only gets a stack from an Error.
	const thrown = error instanceof Error ? error : new Error(String(error));
	const mapped = mapExceptionToCode(thrown);
	const code =
		mapped.code === ERROR_CODES.UNEXPECTED_ERROR ? ERROR_CODES.SCREEN_RENDER_FAILED : mapped.code;
	boundaryLogger.error(`Render failed: ${thrown.message}`, {
		code,
		context: {
			type: 'render.error',
			// The instance is what the Sentry sink captures as an exception; the
			// fields beside it are what the persisted log row keeps, because an
			// Error serialises to `{}`.
			error: thrown,
			errorName: thrown.name,
			errorMessage: thrown.message,
			stack: thrown.stack,
			componentStack: info.componentStack ?? undefined,
		},
	});
}

export function ErrorBoundary({ FallbackComponent = DefaultFallback, onError, ...props }: Props) {
	const handleError = React.useCallback(
		(error: unknown, info: React.ErrorInfo) => {
			reportBoundaryError(error, info);
			onError?.(error, info);
		},
		[onError]
	);

	return <Boundary FallbackComponent={FallbackComponent} onError={handleError} {...props} />;
}
