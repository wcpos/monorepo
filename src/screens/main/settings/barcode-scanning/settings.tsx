import * as React from 'react';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { EditDocumentForm } from '../../components/edit-document-form';

const fields = [
	'barcode_scanning_buffer',
	'barcode_scanning_min_chars',
	'barcode_scanning_prefix',
	'barcode_scanning_suffix',
];

const BarcodeSettings = () => {
	const { store } = useAppState();
	const t = useT();

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

	return <EditDocumentForm document={store} fields={fields} uiSchema={uiSchema} />;
};

export default BarcodeSettings;
