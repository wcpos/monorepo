import * as React from 'react';
import pick from 'lodash/pick';
import Form from '@wcpos/common/src/components/form';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

const uiSchema = {};

export const TaxSettings = () => {
	const { store } = useAppState();

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

	return <Form schema={schema} uiSchema={uiSchema} formData={store.toJSON()} />;
};
