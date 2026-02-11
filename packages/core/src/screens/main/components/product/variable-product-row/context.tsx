import * as React from 'react';

interface VariationRowContextType {
	queryParams: Record<string, any>;
	updateQueryParams: (key: string, value: any) => void;
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
	row: any;
	setRowExpanded?: (rowId: string, expanded: boolean) => void;
	children: React.ReactNode;
}

/**
 *
 */
export function VariationRowProvider({ row, setRowExpanded, children }: VariationRowProviderProps) {
	const [queryParams, setQueryParams] = React.useState({});

	const updateQueryParams = (key: string, value: any) => {
		setQueryParams((prev) => ({ ...prev, [key]: value }));
	};

	return (
		<VariationRowContext.Provider
			value={{ queryParams, updateQueryParams, rowId: row.id, setRowExpanded }}
		>
			{children}
		</VariationRowContext.Provider>
	);
}
