import * as React from 'react';

import pick from 'lodash/pick';

import { useModal } from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import Form from '@wcpos/react-native-jsonschema-form';

import { useT } from '../../../contexts/translations';
import { useCollection } from '../hooks/use-collection';

const AddProduct = () => {
	const { collection } = useCollection('products');
	const { setPrimaryAction } = useModal();
	const t = useT();

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		console.log('not yet');
	}, []);

	/**
	 *
	 */
	React.useEffect(() => {
		setPrimaryAction({
			label: t('Save to Server', { _tags: 'core' }),
			action: handleSave,
		});
	}, [handleSave, setPrimaryAction, t]);

	/**
	 *
	 */
	const handleChange = React.useCallback((data) => {
		console.log('data', data);
	}, []);

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			...collection.schema.jsonSchema,
			properties: pick(collection.schema.jsonSchema.properties, [
				'id',
				'name',
				'price',
				'regular_price',
				'sale_price',
				'meta_data',
			]),
		}),
		[collection.schema.jsonSchema]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			'ui:title': null,
			'ui:description': null,
		}),
		[]
	);

	return <Form item={data} schema={schema} uiSchema={uiSchema} onChange={handleChange} />;
};

export default AddProduct;
