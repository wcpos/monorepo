import { wrappedValidateStorageFactory } from 'rxdb';
import ZSchema from 'z-schema';

import log from '@wcpos/utils/src/logger';

import type { RxJsonSchema } from 'rxdb';

/**
 *
 */
export function getValidator(schema: RxJsonSchema<any>) {
	const validatorInstance = new (ZSchema as any)({
		customValidator: (report, refSchema, json) => {
			if (refSchema.ref && report.hasError('INVALID_TYPE', ['string', 'object'])) {
				report.errors = report.errors.filter((error: any) => {
					return error.code !== 'INVALID_TYPE' || !error.path.includes(report.path[0]);
				});
			}
		},
	});

	const validator = (data: any) => {
		validatorInstance.validate(data, schema);
		return validatorInstance;
	};

	return (docData: any) => {
		if (schema.title === 'RxInternalDocument' || schema.title === 'RxLocalDocument') {
			return [];
		}
		const useValidator = validator(docData);
		if (useValidator === true) {
			return;
		}
		const errors: ZSchema.SchemaErrorDetail[] = (useValidator as any).getLastErrors();
		if (errors) {
			const formattedZSchemaErrors = (errors as any).map(
				({ title, description, message }: any) => ({
					title,
					description,
					message,
				})
			);
			log.error('z-schema validation failed', docData);
			log.error('z-schema validation errors', formattedZSchemaErrors);
			return formattedZSchemaErrors;
		} else {
			return [];
		}
	};
}

export const wrappedValidateZSchemaStorage = wrappedValidateStorageFactory(
	getValidator,
	'z-schema'
);
