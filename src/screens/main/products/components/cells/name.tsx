import * as React from 'react';
import type { TextInput as TextInputType } from 'react-native';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import TextInput, { TextInputContainer } from '@wcpos/components/src/textinput';

import ProductAttributes from '../../../components/product/attributes';
import GroupedNames from '../../../components/product/grouped-names';
import { ProductsProvider } from '../../../contexts/products';
import { useUISettings } from '../../../contexts/ui-settings/use-ui-settings';
import usePushDocument from '../../../contexts/use-push-document';

type Props = {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
};

/**
 *
 */
const EdittableText = ({ name }) => {
	// const [newName, setNewName] = React.useState(name);
	const [isEditting, setIsEditting] = React.useState(false);

	return isEditting ? (
		<TextInput
			value={name}
			// onChangeText={setNewName}
			// onBlur={async () => {
			// 	await product.patch({ name: newName });
			// 	pushDocument(product);
			// }}
			focused
		/>
	) : (
		<TextInputContainer onPress={() => setIsEditting(true)}>{name}</TextInputContainer>
	);
};

/**
 *
 */
const Name = ({ item: product, column }: Props) => {
	const name = useObservableState(product.name$, product.name);
	// const [newName, setNewName] = React.useState(name);
	const attributes = useObservableState(product.attributes$, product.attributes);
	const grouped = useObservableState(product.grouped_products$, product.grouped_products);
	const groupedQuery = React.useMemo(() => ({ selector: { id: { $in: grouped } } }), [grouped]);
	const pushDocument = usePushDocument();
	const { uiSettings } = useUISettings('products');
	const { display } = column;

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *
	 */
	return (
		<Box space="small" style={{ width: '100%' }}>
			<EdittableText name={name} />
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{product.type === 'variable' && <ProductAttributes attributes={attributes} />}
			{product.type === 'grouped' && (
				<ProductsProvider initialQuery={groupedQuery} uiSettings={uiSettings}>
					<GroupedNames />
				</ProductsProvider>
			)}
		</Box>
	);
};

export default Name;
