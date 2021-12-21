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
	console.log(item.collection.schema.topLevelFields);

	return null;
};

export default EditModal;
