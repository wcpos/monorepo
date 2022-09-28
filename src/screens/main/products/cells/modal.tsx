import * as React from 'react';
import Tabs from '@wcpos/components/src/tabs';
import Tree from '@wcpos/components/src/tree';
import Form from '@wcpos/react-native-jsonschema-form';

type ProductModalProps = {
	product: import('@wcpos/database').ProductDocument;
};

const Modal = ({ product }: ProductModalProps) => {
	const [index, setIndex] = React.useState(0);

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'form':
				return <Form schema={product.collection.schema.jsonSchema} formData={product.toJSON()} />;
			case 'json':
				return <Tree data={product.toJSON()} />;
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

export default Modal;
