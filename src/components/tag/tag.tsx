import React from 'react';
import * as Styled from './styles';
import Text from '../text';
import useTheme from '../../hooks/use-theme';

export interface Props {
	children: string;
}

const Tag: React.FC<Props> = ({ children }) => {
	const { theme } = useTheme();
	return (
		<Styled.Tag>
			<Text size="small" style={{ color: theme.TAG_TEXT_COLOR }}>
				{children}
			</Text>
		</Styled.Tag>
	);
};

export default Tag;
