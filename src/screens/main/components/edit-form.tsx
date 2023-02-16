import * as React from 'react';

import Tabs from '@wcpos/components/src/tabs';
import Tree from '@wcpos/components/src/tree';
import Form from '@wcpos/react-native-jsonschema-form';

export interface EditModalProps {
	item:
		| import('@wcpos/database').ProductDocument
		| import('@wcpos/database').OrderDocument
		| import('@wcpos/database').CustomerDocument
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
	schema: import('json-schema').JSONSchema7;
	uiSchema: Record<string, any>;
}

/**
 *
 */
const EditForm = ({ schema, uiSchema, item }: EditModalProps) => {
	const [index, setIndex] = React.useState(0);

	/**
	 *
	 */
	const handleChange = React.useCallback(
		(newData) => {
			const latest = item.getLatest();
			latest.patch(newData);
		},
		[item]
	);

	/**
	 *
	 */
	const renderScene = React.useCallback(
		({ route }) => {
			const latest = item.getLatest();
			const data = latest.toMutableJSON();
			switch (route.key) {
				case 'form':
					return (
						<Form schema={schema} formData={data} uiSchema={uiSchema} onChange={handleChange} />
					);
				case 'json':
					return <Tree data={data} />;
				default:
					return null;
			}
		},
		[handleChange, item, schema, uiSchema]
	);

	/**
	 *
	 */
	const routes = React.useMemo(
		() => [
			{ key: 'form', title: 'Form' },
			{ key: 'json', title: 'JSON' },
		],
		[]
	);

	/**
	 *
	 */
	return (
		<Tabs<(typeof routes)[number]>
			navigationState={{ index, routes }}
			renderScene={renderScene}
			onIndexChange={setIndex}
		/>
	);
};

export default EditForm;
