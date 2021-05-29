import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import Select from '@wcpos/common/src/components/select';
import Checkbox from '@wcpos/common/src/components/checkbox';
import MetaData from '@wcpos/common/src/components/meta-data';

export interface EditModalProps {
	item:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
	onClose: () => void;
}

const EditModal = ({ item, onClose }: EditModalProps) => {
	useObservableState(item.$); // re-render

	const handleChangeTaxClass = async (newValue: string): Promise<void> => {
		item.atomicPatch({ taxClass: newValue });
	};

	const hasProperty = (property: string) => {
		return item.collection.schema.topLevelFields.includes(property);
	};

	return (
		<Dialog
			title={item.name || item.methodTitle}
			open
			onClose={onClose}
			primaryAction={{ label: 'Save', action: onClose }}
		>
			<Dialog.Section>
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
			</Dialog.Section>
		</Dialog>
	);
};

export default EditModal;
