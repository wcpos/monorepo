import React from 'react';
import * as Styled from './styles';

export interface SpaceProps {
	/**
	 * Spacing value.
	 */
	value: import('@wcpos/common/src/themes').Spacing;
}

/**
 * Used to add spacing between components.
 */
export const Space = ({ value = 'medium' }: SpaceProps) => {
	return <Styled.Space value={value} />;
};
