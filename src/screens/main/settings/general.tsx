import * as React from 'react';

import { decode } from 'html-entities';
import pick from 'lodash/pick';
import { useObservablePickState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Form from '@wcpos/react-native-jsonschema-form';

import useLocalData from '../../../contexts/local-data';

const uiSchema = {};

export const GeneralSettings = () => {
	const { store } = useLocalData();
	const formData = store.toJSON();

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			...store?.collection.schema.jsonSchema,
			properties: pick(store?.collection.schema.jsonSchema.properties, [
				'name',
				'locale',
				// 'store_address',
				// 'store_address_2',
				// 'store_city',
				// 'default_country',
				// 'store_postcode',
				// 'enable_coupons',
				// 'calc_discounts_sequentially',
				'currency',
				'currency_pos',
				'price_thousand_sep',
				'price_decimal_sep',
				'price_num_decimals',
			]),
		};

		// fix html entities for currency
		// _schema.properties.currency.enumNames = _schema.properties.currency.enumNames.map(decode);

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

	/**
	 *
	 */
	return <Form schema={schema} uiSchema={uiSchema} formData={formData} onChange={handleOnChange} />;
};
