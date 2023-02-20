import * as React from 'react';

import pick from 'lodash/pick';
import { useObservableState } from 'observable-hooks';

import { useModal } from '@wcpos/components/src/modal';

import { t } from '../../../lib/translations';
import EditModal from '../components/edit-form';
import useProducts from '../contexts/products';

const EditProduct = () => {
	const {
		data: [product],
	} = useProducts();

	if (!product) {
		throw new Error(t('Product not found', { _tags: 'core' }));
	}

	const { setTitle } = useModal();
	const name = useObservableState(product.name$, product.name);

	React.useEffect(() => {
		setTitle(() => t('Edit {name}', { _tags: 'core', name, _context: 'Edit Product title' }));
	}, [name, setTitle]);

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...product.collection.schema.jsonSchema,
			properties: pick(product.collection.schema.jsonSchema.properties, [
				'name',
				'status',
				'description',
				'short_description',
				'sku',
				'price',
				'regular_price',
				'sale_price',
				'date_on_sale_from',
				'date_on_sale_to',
				'on_sale',
				'tax_status',
				'tax_class',
				'manage_stock',
				'stock_quantity',
				'low_stock_amount',
				// 'weight',
				// 'dimensions',
				// 'categories',
				// 'tags',
				'meta_data',
			]),
		};
	}, [product.collection.schema.jsonSchema]);

	/**
	 *  uiSchema
	 */
	const uiSchema = React.useMemo(
		() => ({
			// billing: { 'ui:collapsible': 'closed', 'ui:title': t('Billing Address', { _tags: 'core' }) },
			// shipping: {
			// 	'ui:collapsible': 'closed',
			// 	'ui:title': t('Shipping Address', { _tags: 'core' }),
			// },
			// tax_lines: { 'ui:collapsible': 'closed', 'ui:title': t('Taxes', { _tags: 'core' }) },
			meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data', { _tags: 'core' }) },
		}),
		[]
	);

	return <EditModal item={product} schema={schema} uiSchema={uiSchema} />;
};

export default EditProduct;
