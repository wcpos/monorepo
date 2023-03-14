import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Tabs from '@wcpos/components/src/tabs';
import Tree from '@wcpos/components/src/tree';
import Form from '@wcpos/react-native-jsonschema-form';

export interface EditModalProps {
	data: Record<string, any>;
	schema: import('json-schema').JSONSchema7;
	uiSchema: Record<string, any>;
	onChange: (data: Record<string, any>) => void;
}

/**
 *
 */
const EditForm = ({ data, schema, uiSchema, onChange }: EditModalProps) => {
	const [formData, setFormData] = React.useState(data);
	const [index, setIndex] = React.useState(0);

	/**
	 *
	 */
	const handleChange = React.useCallback(
		(newData) => {
			setFormData(newData);
			onChange && onChange(newData);
		},
		[onChange]
	);

	/**
	 *
	 */
	const renderScene = React.useCallback(
		({ route }) => {
			switch (route.key) {
				case 'form':
					return (
						<Box padding="small">
							<Form
								schema={schema}
								formData={formData}
								uiSchema={uiSchema}
								onChange={handleChange}
							/>
						</Box>
					);
				case 'json':
					return <Tree data={data} />;
				default:
					return null;
			}
		},
		[data, formData, handleChange, schema, uiSchema]
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
