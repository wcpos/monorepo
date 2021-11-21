import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { Slider } from '@wcpos/common/src/components/Slider';
import Text from '@wcpos/common/src/components/text';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import * as Styled from './styles';

interface ProductFooterProps {
	count: number;
}

const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useAppState();
	const total = useObservableState(storeDB.products.totalDocuments$, 0);

	return (
		<Styled.Footer>
			<Slider max={1000} />
			<Text>
				{count} of {total}
			</Text>
		</Styled.Footer>
	);
};

export default ProductsFooter;
