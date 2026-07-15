import * as React from 'react';

import { QueryStateProvider } from '../../../../../query';

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
	children: React.ReactNode;
}

/**
 *
 */
export function VariationRowProvider({ row, setRowExpanded, children }: VariationRowProviderProps) {
	return (
		<VariationRowContext.Provider value={{ rowId: row.id, setRowExpanded }}>
			<QueryStateProvider
				collection="variations"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				{children}
			</QueryStateProvider>
		</VariationRowContext.Provider>
	);
}
