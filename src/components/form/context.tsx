import * as React from 'react';
import fields from './fields';
import widgets from './widgets';

import type { Schema } from './types';

interface FormContextProps {
	registry: {
		fields: typeof fields;
		widgets: typeof widgets;
	};
	rootSchema: Schema;
	onChange: (change: any) => void;
}

const FormContext = React.createContext<FormContextProps>(null);

interface FormContextProviderProps {
	children: React.ReactNode;
	schema: Schema;
	onChange: (change: any) => void;
	formContext: any;
}

export const FormContextProvider = ({
	children,
	schema,
	onChange,
	formContext,
}: FormContextProviderProps) => {
	const value = React.useMemo(() => {
		return {
			registry: {
				fields,
				widgets,
			},
			rootSchema: Object.freeze(schema),
			onChange,
			formContext,
		};
	}, [formContext, onChange, schema]);

	return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
};

export const useFormContext = () => {
	const context = React.useContext(FormContext);
	if (!context) {
		throw new Error(`useFormContext must be called within FormContextProvider`);
	}
	return context;
};
