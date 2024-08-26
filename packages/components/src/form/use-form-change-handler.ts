import * as React from 'react';

import get from 'lodash/get';
import { UseFormReturn, FieldValues } from 'react-hook-form';

interface UseFormChangeHandlerOptions<T extends FieldValues> {
	form: UseFormReturn<T>;
	onChange: (changes: Partial<T>) => void;
}

export function useFormChangeHandler<T extends FieldValues>({
	form,
	onChange,
}: UseFormChangeHandlerOptions<T>) {
	React.useEffect(() => {
		const subscription = form.watch((values, { type, name }) => {
			if (type === 'change' && name) {
				const changes = { [name]: get(values, name) };
				onChange(changes);
			}
		});

		return () => subscription.unsubscribe();
	}, [onChange, form]);
}
