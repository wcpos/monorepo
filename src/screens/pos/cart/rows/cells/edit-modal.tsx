import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import TextInput from '@wcpos/common/src/components/textinput';
import Select from '@wcpos/common/src/components/select';
import Checkbox from '@wcpos/common/src/components/checkbox';
import MetaData from '@wcpos/common/src/components/meta-data';
import Tabs from '@wcpos/common/src/components/tabs';

export interface EditModalProps {
	item:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
}

const EditModal = ({ item }: EditModalProps) => {
	useObservableState(item.$); // re-render

	const handleChangeTaxClass = async (newValue: string): Promise<void> => {
		item.atomicPatch({ taxClass: newValue });
	};

	const hasProperty = (property: string) => {
		return item.collection.schema.topLevelFields.includes(property);
	};

	return (
		<>
			{hasProperty('name') && <TextInput label="Name" value={item.name} />}
			{hasProperty('taxStatus') && (
				<Checkbox
					label="Taxable"
					checked={item.taxStatus === 'taxable'}
					onChange={(value) => item.atomicPatch({ taxStatus: value ? 'taxable' : 'none' })}
				/>
			)}
			{hasProperty('taxClass') && (
				<TextInput label="Tax Class" value={item.taxClass} onChange={handleChangeTaxClass} />
			)}
			<MetaData
				// @ts-ignore
				data={item.metaData}
			/>
		</>
	);
};

export default EditModal;
