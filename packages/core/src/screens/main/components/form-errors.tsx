import React from 'react';
import { View } from 'react-native';

import { useFormState } from 'react-hook-form';

import { Text } from '@wcpos/components/text';

import { flattenErrors } from './flatten-errors';
import { useT } from '../../../contexts/translations';

/**
 * TODO: this should probably be in the components package, but we need to extract useT first.
 * TODO: translate zod error messages using z.setErrorMap
 *
 * NOTE: useFormState (not useFormContext) is required here. useFormContext().formState
 * relies on the parent component re-rendering to propagate updated errors. If the parent
 * doesn't read formState.errors itself, it won't re-render when validation fails and
 * this component would never show errors. useFormState sets up its own subscription
 * so it re-renders independently when errors change.
 */
export function FormErrors() {
	const t = useT();
	const { errors } = useFormState();

	const errorMessages = flattenErrors(errors);

	if (errorMessages.length === 0) {
		return null;
	}

	return (
		<View>
			<Text className="text-error">{t('common.please_fix_the_following_errors')}</Text>
			{errorMessages.map((error, index) => (
				<Text className="text-error" key={index}>
					{'\u2022'} {error.path}: {error.message}
				</Text>
			))}
		</View>
	);
}
