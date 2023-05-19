import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';

import AttributePill from './attribute-pill';

/**
 *
 */
const VariationsFilterBar = ({ parent }) => {
	const theme = useTheme();

	/**
	 *
	 */
	return (
		<Box
			horizontal
			padding="small"
			space="small"
			style={{
				backgroundColor: theme.colors.grey,
			}}
		>
			{(parent.attributes || [])
				.filter((attribute) => attribute.variation)
				.sort((a, b) => (a.position || 0) - (b.position || 0))
				.map((attribute) => (
					<AttributePill key={attribute.id} attribute={attribute} />
				))}
		</Box>
	);
};

export default VariationsFilterBar;
