import * as React from 'react';

interface VariationRowContextType {
	queryParams: Record<string, any>;
	updateQueryParams: (key: string, value: any) => void;
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

/**
 *
 */
export const VariationRowProvider = ({ row, children }) => {
	const [queryParams, setQueryParams] = React.useState({});

	const updateQueryParams = (key, value) => {
		setQueryParams((prev) => ({ ...prev, [key]: value }));
	};

	return (
		<VariationRowContext.Provider value={{ queryParams, updateQueryParams }}>
			{children}
		</VariationRowContext.Provider>
	);
};
