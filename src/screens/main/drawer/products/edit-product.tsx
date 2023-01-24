import * as React from 'react';

import Modal from '@wcpos/components/src/modal';

import EditForm from '../../common/edit-form';

const EditProduct = ({ navigation, route }) => {
	const { productID } = route.params;
	const product = {};
	const schema = {};

	return (
		<Modal
			size="large"
			opened
			onClose={() => navigation.goBack()}
			title={`Edit ${product.name}`}
			primaryAction={{
				label: 'Save',
				action: () => {
					console.log('save');
				},
			}}
			secondaryActions={[
				{
					label: 'Cancel',
					action: () => navigation.goBack(),
				},
			]}
		>
			<EditForm item={product} schema={schema} uiSchema={{}} />
		</Modal>
	);
};

export default EditProduct;
