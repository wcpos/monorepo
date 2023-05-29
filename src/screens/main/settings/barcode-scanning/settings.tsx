import * as React from 'react';

import useLocalData from '../../../../contexts/local-data';
import Form from '../../components/document-form';

const BarcodeSettings = () => {
	const { store } = useLocalData();

	return (
		<Form
			document={store}
			uiSchema={{
				'ui:title': null,
				'ui:description': null,
				barcode_scanning_buffer: {
					'ui:label': 'Barcode Scanning Buffer (ms)',
				},
				barcode_scanning_min_chars: {
					'ui:label': 'Barcode Minimum Length',
				},
				barcode_scanning_prefix: {
					'ui:label': 'Barcode Scanner Prefix',
				},
				barcode_scanning_suffix: {
					'ui:label': 'Barcode Scanner Suffix',
				},
			}}
			fields={[
				'barcode_scanning_buffer',
				'barcode_scanning_min_chars',
				'barcode_scanning_prefix',
				'barcode_scanning_suffix',
			]}
		/>
	);
};

export default BarcodeSettings;
