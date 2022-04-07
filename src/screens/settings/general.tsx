import * as React from 'react';
import pick from 'lodash/pick';
import Form from '@wcpos/common/src/components/form';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

const uiSchema = {};

export const GeneralSettings = () => {
	const { store } = useAppState();

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			...store?.collection.schema.jsonSchema,
			properties: pick(store?.collection.schema.jsonSchema.properties, [
				'name',
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

		return _schema;
	}, [store?.collection.schema.jsonSchema]);

	/**
	 *
	 */
	const handleOnChange = React.useCallback(
		(data) => {
			store?.atomicPatch(data);
		},
		[store]
	);

	/**
	 *
	 */
	return (
		<Form schema={schema} uiSchema={uiSchema} formData={store.toJSON()} onChange={handleOnChange} />
	);
};
