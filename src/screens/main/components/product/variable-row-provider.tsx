/**
 * @TODO - this provider holds the varibale product row state
 * It would nice to have a generic Table Row Product that can be used for all data types
 */
import * as React from 'react';

const VariableProductRowContext = React.createContext<any>(null);

interface VariableProductRowProps {
	children: React.ReactNode;
	parent: import('@wcpos/database').ProductDocument;
}

export const VariableProductRowProvider = ({ children, parent }: VariableProductRowProps) => {
	const [expanded, setExpanded] = React.useState(false);

	const value = React.useMemo(() => {
		return {
			expanded,
			setExpanded,
			parent,
		};
	}, [expanded, parent]);

	return (
		<VariableProductRowContext.Provider value={value}>
			{children}
		</VariableProductRowContext.Provider>
	);
};

export const useVariableProductRow = () => {
	const context = React.useContext(VariableProductRowContext);
	if (!context) {
		throw new Error(`useVariableProductRow must be called within VariableProductRowProvider`);
	}

	return context;
};
