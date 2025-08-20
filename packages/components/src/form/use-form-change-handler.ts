import * as React from 'react';

import get from 'lodash/get';
import { FieldValues, UseFormReturn } from 'react-hook-form';

interface UseFormChangeHandlerOptions<T extends FieldValues> {
	form: UseFormReturn<T>;
	onChange: (changes: Partial<T>) => void;
}

export function useFormChangeHandler<T extends FieldValues>({
	form,
	onChange,
}: UseFormChangeHandlerOptions<T>) {
	React.useEffect(() => {
		const subscription = form.watch((values, { name }) => {
			if (name) {
				const changes = { [name]: get(values, name) };
				onChange(changes);
			} else {
				// If 'name' is undefined, handle the change accordingly
				onChange(values);
			}
		});

		return () => subscription.unsubscribe();
	}, [onChange, form]);
}
