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
import { Query } from '../../../contexts/query';
import { useUISettings } from '../../../contexts/ui-settings/use-ui-settings';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

/**
 *
 */
const EdittableText = ({ name, onChange }) => {
	const [value, setValue] = React.useState(name);
	const [isEditting, setIsEditting] = React.useState(false);

	return isEditting ? (
		<TextInput
			value={value}
			onChangeText={setValue}
			onBlur={() => {
				setIsEditting(false);
				onChange(value);
			}}
			blurOnSubmit
			autoFocus
		/>
	) : (
		<TextInputContainer onPress={() => setIsEditting(true)}>{value}</TextInputContainer>
	);
};

/**
 *
 */
const Name = ({ item: product, column, onChange, toggleVariations }: Props) => {
	const name = useObservableState(product.name$, product.name);
	const grouped = useObservableState(product.grouped_products$, product.grouped_products);
	const groupedQuery = React.useMemo(
		() => new Query({ selector: { id: { $in: grouped } } }),
		[grouped]
	);
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
			<Text weight="bold">{name}</Text>
			{/* <EdittableText name={name} onChange={(name: string) => onChange(product, { name })} /> */}
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{product.type === 'variable' && <ProductAttributes product={product} />}
			{product.type === 'grouped' && (
				<ProductsProvider query={groupedQuery}>
					<GroupedNames />
				</ProductsProvider>
			)}
		</Box>
	);
};

export default Name;
