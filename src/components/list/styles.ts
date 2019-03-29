import styled from 'styled-components/native';

type ThemeProps = import('../../lib/theme/types').ThemeProps;

export const ListView = styled.View<{ theme: ThemeProps }>`
	padding: 5px;
`;

export const ListItemView = styled.View<{ theme: ThemeProps }>`
	flex-direction: row;
	align-items: center;
	padding: 5px;
`;

export const ListItemTextView = styled.View<{ theme: ThemeProps }>`
	flex: 1;
`;
