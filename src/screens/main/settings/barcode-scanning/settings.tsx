import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import Form from '@wcpos/react-native-jsonschema-form';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const BarcodeSettings = () => {
	const { store } = useAppState();
	const { localPatch } = useLocalMutation();
	const t = useT();

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const orderSchema = get(store.collection, 'schema.jsonSchema.properties');
		const fields = [
			'barcode_scanning_buffer',
			'barcode_scanning_min_chars',
			'barcode_scanning_prefix',
			'barcode_scanning_suffix',
		];
		return {
			properties: pick(orderSchema, fields),
		};
	}, [store.collection]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			'ui:title': null,
			'ui:description': null,
			barcode_scanning_buffer: {
				'ui:label': t('Barcode Scanning Buffer (ms)', { _tags: 'core' }),
			},
			barcode_scanning_min_chars: {
				'ui:label': t('Barcode Minimum Length', { _tags: 'core' }),
			},
			barcode_scanning_prefix: {
				'ui:label': t('Barcode Scanner Prefix', { _tags: 'core' }),
			},
			barcode_scanning_suffix: {
				'ui:label': t('Barcode Scanner Suffix', { _tags: 'core' }),
			},
		}),
		[t]
	);

	return (
		<Form
			formData={store.toMutableJSON()}
			schema={schema}
			uiSchema={uiSchema}
			onChange={({ changes }) => localPatch({ document: store, data: changes })}
		/>
	);
};

export default BarcodeSettings;
