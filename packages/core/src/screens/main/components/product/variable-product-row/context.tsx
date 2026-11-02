import * as React from 'react';

import { QueryStateProvider } from '../../../../../query';

import type { VariationMatch } from '../../../../../query';

interface VariationRowContextType {
	rowId: string;
	setRowExpanded?: (rowId: string, expanded: boolean) => void;
}

/**
 * Variation Row Context allows us to set values on the Variable Row and
 * access them in the Variations table
 */
const VariationRowContext = React.createContext<VariationRowContextType | undefined>(undefined);

/**
 *
 */
export const useVariationRow = () => {
	const context = React.useContext(VariationRowContext);
	if (!context) {
		throw new Error('useVariationRow must be used within a VariationRowProvider');
	}
	return context;
};

interface VariationRowProviderProps {
	row: { id: string };
	setRowExpanded?: (rowId: string, expanded: boolean) => void;
	/** Where a drilled pane's variations start: a chip's attribute, or the search that matched them. */
	initialMatches?: VariationMatch[];
	initialSearch?: string;
	children: React.ReactNode;
}

/**
 *
 */
export function VariationRowProvider({
	row,
	setRowExpanded,
	initialMatches,
	initialSearch,
	children,
}: VariationRowProviderProps) {
	// Memoised explicitly: this provider sits under a TanStack row that carries a document,
	// so it re-renders on product writes. The React Compiler happens to cache this literal
	// today, but the stability is the point of the context — it should not rest on a build
	// flag.
	const value = React.useMemo(() => ({ rowId: row.id, setRowExpanded }), [row.id, setRowExpanded]);

	return (
		<VariationRowContext.Provider value={value}>
			<QueryStateProvider
				collection="variations"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'menu_order', direction: 'asc' }}
				initialFilters={initialMatches ? { attributeMatches: initialMatches } : undefined}
				initialSearch={initialSearch}
			>
				{children}
			</QueryStateProvider>
		</VariationRowContext.Provider>
	);
}
