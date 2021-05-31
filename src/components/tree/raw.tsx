import * as React from 'react';
import * as Styled from './styles';

export interface RawTreeProps {
	data: any;
}

export const Raw = ({ data }: RawTreeProps) => {
	const raw = JSON.stringify(data, null, '  ');

	return (
		<Styled.Raw multiline numberOfLines={raw.split('\n').length} editable={false} value={raw} />
	);
};
