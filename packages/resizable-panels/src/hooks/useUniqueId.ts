import React from 'react';

/**
 * Returns `providedId` when given, otherwise a stable id from React's `useId`.
 */
export function useUniqueId(providedId?: string | null): string {
	const generatedId = React.useId();
	return providedId ?? generatedId;
}
