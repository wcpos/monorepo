import * as React from 'react';
import Tabs from '@wcpos/common/src/components/tabs';
import Tree from '@wcpos/common/src/components/tree';
import Form from '@wcpos/common/src/components/form';

export interface EditModalProps {
	item:
		| import('@wcpos/common/src/database').ProductDocument
		| import('@wcpos/common/src/database').OrderDocument
		| import('@wcpos/common/src/database').CustomerDocument
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
	schema: import('json-schema').JSONSchema7;
	uiSchema: Record<string, any>;
}

const EditModal = ({ schema, uiSchema, item }: EditModalProps) => {
	const [index, setIndex] = React.useState(0);

	const handleChange = React.useCallback(
		(newData) => {
			item.atomicPatch(newData);
		},
		[item]
	);

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'form':
				return (
					<Form
						schema={schema}
						formData={item.toJSON()}
						uiSchema={uiSchema}
						onChange={handleChange}
					/>
				);
			case 'json':
				return <Tree data={item.toJSON()} />;
			default:
				return null;
		}
	};

	const routes = [
		{ key: 'form', title: 'Form' },
		{ key: 'json', title: 'JSON' },
	];

	return (
		<Tabs<typeof routes[number]>
			navigationState={{ index, routes }}
			renderScene={renderScene}
			onIndexChange={setIndex}
		/>
	);
};

export default EditModal;
