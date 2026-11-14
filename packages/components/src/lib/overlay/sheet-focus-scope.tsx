import type * as React from 'react';

/** Native: a sheet has no web focus trap to pause; the panel is itself. */
export function SheetFocusScope({ children }: { children: React.ReactElement }) {
	return children;
}
