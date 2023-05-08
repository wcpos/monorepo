import * as React from 'react';

import { VariationsProvider } from '../../contexts/variations';

const ProductTableRowWithVariations = () => {
	return (
		<VariationsProvider parent={item} uiSettings={extraData.uiSettings}>
			<Box>
				<Table.Row
					item={item}
					index={index}
					extraData={extraData}
					target={target}
					cellRenderer={simpleProductCellRenderer}
				/>
				<Box padding="xxLarge" style={{ borderLeftColor: 'grey', borderLeftWidth: 10 }}>
					<Text>hi</Text>
				</Box>
			</Box>
		</VariationsProvider>
	);
};
