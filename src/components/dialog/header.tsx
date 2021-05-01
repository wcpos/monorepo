import * as React from 'react';
import Icon from '../icon';
import * as Styled from './styles';

export interface HeaderProps {
	title?: string;
	onClose: () => void;
	hideClose?: boolean;
}

/**
 * Displays the Modal Header.
 */
export const Header = ({ title, onClose, hideClose }: HeaderProps) => (
	<Styled.Header>
		<Styled.HeaderText size="large">{title}</Styled.HeaderText>
		{hideClose ? null : <Icon name="close" onPress={onClose} />}
	</Styled.Header>
);
