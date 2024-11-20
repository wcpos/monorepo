import React from 'react';
import { View } from 'react-native';

import { useFormContext } from 'react-hook-form';

import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../contexts/translations';

/**
 * TODO: this should probably be in the components package, but we need to extract useT first.
 * TODO: translate zod error messages using z.setErrorMap
 */
export const FormErrors = () => {
	const t = useT();
	const {
		formState: { errors },
	} = useFormContext();

	/**
	 *
	 */
	const flattenErrors = (errors, path = '', result = []) => {
		Object.keys(errors).forEach((key) => {
			const error = errors[key];
			const currentPath = path ? `${path}.${key}` : key;

			if (error && typeof error === 'object') {
				if (error.message) {
					// It's a field error
					result.push({ path: currentPath, message: error.message });
				} else {
					// It's a nested object, recurse into it
					flattenErrors(error, currentPath, result);
				}
			}
		});

		return result;
	};

	const errorMessages = flattenErrors(errors);

	if (errorMessages.length === 0) {
		return null;
	}

	return (
		<View>
			<Text className="text-error">{t('Please fix the following errors:', { _tags: 'core' })}</Text>
			{errorMessages.map((error, index) => (
				<Text className="text-error" key={index}>
					{'\u2022'} {error.path}: {error.message}
				</Text>
			))}
		</View>
	);
};
