import * as React from 'react';

import { UseFormReturn, FieldValues } from 'react-hook-form';

interface UseFormChangeHandlerOptions<T extends FieldValues> {
	form: UseFormReturn<T>;
	formData: T;
	onChange: (changes: Partial<T>) => void;
}

export function useFormChangeHandler<T extends FieldValues>({
	form,
	formData,
	onChange,
}: UseFormChangeHandlerOptions<T>) {
	React.useEffect(() => {
		const subscription = form.watch((values) => {
			const changes: Partial<T> = {};

			Object.keys(values).forEach((key) => {
				if (JSON.stringify(values[key]) !== JSON.stringify(formData[key])) {
					changes[key as keyof T] = values[key];
				}
			});

			if (Object.keys(changes).length > 0) {
				onChange(changes);
			}
		});

		return () => subscription.unsubscribe();
	}, [formData, onChange, form]);
}
