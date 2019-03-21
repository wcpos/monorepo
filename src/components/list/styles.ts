import styled from 'styled-components/native';

type ThemeProps = import('../../lib/theme/types').ThemeProps;

export const ListView = styled.View<{ theme: ThemeProps }>``;

export const ListItemView = styled.View<{ theme: ThemeProps }>`
	flex-direction: row;
	align-items: center;
`;

export const ListItemTextView = styled.View<{ theme: ThemeProps }>`
	flex: 1;
`;

export const ListItemText = styled.Text<{ theme: ThemeProps }>`
	padding: ${props => props.theme.LIST_ITEM_PADDING};
`;
