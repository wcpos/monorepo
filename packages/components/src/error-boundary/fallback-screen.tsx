import * as React from 'react';

import { GateScreen } from '../gate-screen';

import type { FallbackProps } from 'react-error-boundary';

// The fallback renders when the tree under it threw, translations included, so its words are
// English, as the inline bar's "Something went wrong" already is.
const COPY = { title: 'Something went wrong', retry: 'Try again' } as const;
/** One line of the thrown message, never a wall: the full error is in the log row. */
const DETAIL_MAX = 300;

/**
 * The fallback for a boundary around a whole route: the screen is gone, so the gate takes its
 * place. A boundary around one part of a screen keeps the inline bar (`Fallback`).
 */
export function FallbackScreen({ error, resetErrorBoundary }: FallbackProps) {
	const message = error instanceof Error ? error.message : String(error);
	return (
		<GateScreen
			testID="error-boundary-screen"
			tone="bad"
			title={COPY.title}
			detail={message.length > DETAIL_MAX ? `${message.slice(0, DETAIL_MAX - 1)}…` : message}
			primary={{ label: COPY.retry, onPress: resetErrorBoundary, testID: 'error-boundary-retry' }}
		/>
	);
}
