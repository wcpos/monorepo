import * as React from 'react';

import pick from 'lodash/pick';

import Form from '@wcpos/react-native-jsonschema-form';

import useLocalData from '../../../contexts/local-data';

const uiSchema = {};

export const TaxSettings = () => {
	const { store } = useLocalData();

	const schema = React.useMemo(() => {
		const _schema = {
			...store?.collection.schema.jsonSchema,
			properties: pick(store?.collection.schema.jsonSchema.properties, [
				'calc_taxes',
				'prices_include_tax',
				'tax_based_on',
				'shipping_tax_class',
				'tax_round_at_subtotal',
				'tax_display_shop',
				'tax_display_cart',
				'price_display_suffix',
				'tax_total_display',
			]),
		};

		return _schema;
	}, [store?.collection.schema.jsonSchema]);

	/**
	 *
	 */
	const handleOnChange = React.useCallback(
		(data) => {
			store?.incrementalPatch(data);
		},
		[store]
	);

	return (
		<Form schema={schema} uiSchema={uiSchema} formData={store.toJSON()} onChange={handleOnChange} />
	);
};
