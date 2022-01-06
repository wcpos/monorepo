import * as React from 'react';
import { View, ScrollView } from 'react-native';
import { useObservableState } from 'observable-hooks';
import Tabs from '@wcpos/common/src/components/tabs';
import Tree from '@wcpos/common/src/components/tree';
import Box from '@wcpos/common/src/components/box';
import Button from '@wcpos/common/src/components/button';
import { BaseInputContainer } from '@wcpos/common/src/components/base-input';
import Form from 'react-jsonschema-form';

export interface EditModalProps {
	item: import('@wcpos/common/src/database').LineItemDocument;
	// | import('@wcpos/common/src/database').FeeLineDocument
	// | import('@wcpos/common/src/database').ShippingLineDocument;
}

type WooCommerceOrderLineItemSchema =
	import('@wcpos/common/src/database/collections/line-items/interface').WooCommerceOrderLineItemSchema;

function ArrayFieldTemplate(props) {
	return (
		<Box>
			{props.items.map((element) => element.children)}
			{props.canAdd && <Button title="Add" onPress={props.onAddClick} />}
		</Box>
	);
}

function CustomFieldTemplate(props) {
	const { id, classNames, label, help, required, description, errors, children } = props;

	return (
		<BaseInputContainer label={label} helpText={help}>
			{children}
		</BaseInputContainer>
	);
	// return (
	// 	<div className={classNames}>
	// 		<label htmlFor={id}>
	// 			{label}
	// 			{required ? '*' : null}
	// 		</label>
	// 		{description}
	// 		{children}
	// 		{errors}
	// 		{help}
	// 	</div>
	// );
}

function ObjectFieldTemplate(props) {
	return (
		<ScrollView style={{ height: 300 }}>
			{props.properties.map((element) => (
				<Box>{element.content}</Box>
			))}
		</ScrollView>
	);
}

const EditModal = ({ item }: EditModalProps) => {
	const [index, setIndex] = React.useState(0);

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'form':
				return (
					<Form<WooCommerceOrderLineItemSchema>
						schema={item.collection.schema.jsonSchema}
						formData={item.toJSON()}
						ArrayFieldTemplate={ArrayFieldTemplate}
						FieldTemplate={CustomFieldTemplate}
						ObjectFieldTemplate={ObjectFieldTemplate}
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
