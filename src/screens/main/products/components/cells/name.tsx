import * as React from 'react';
import type { TextInput as TextInputType } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import TextInput from '@wcpos/components/src/textinput';

import ProductAttributes from '../../../components/product/attributes';
import GroupedNames from '../../../components/product/grouped-names';
import { ProductsProvider } from '../../../contexts/products';
import { useUISettings } from '../../../contexts/ui-settings/use-ui-settings';
import usePushDocument from '../../../contexts/use-push-document';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Name = ({ item: product }: Props) => {
	const name = useObservableState(product.name$, product.name);
	const attributes = useObservableState(product.attributes$, product.attributes);
	const grouped = useObservableState(product.grouped_products$, product.grouped_products);
	const groupedQuery = React.useMemo(() => ({ selector: { id: { $in: grouped } } }), [grouped]);
	const pushDocument = usePushDocument();
	const textInputRef = React.useRef<TextInputType>(null);
	const { uiSettings } = useUISettings('products');

	/**
	 *
	 */
	return (
		<Box space="small" style={{ width: '100%' }}>
			<TextInput
				ref={textInputRef}
				value={name}
				onBlur={async () => {
					const latest = product.getLatest();
					await latest.patch({ name: textInputRef.current.value });
					pushDocument(latest);
				}}
			/>
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
