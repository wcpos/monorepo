import styled from 'styled-components/native';

export const Container = styled.View`
	align-items: center;
	justify-content: center;
	flex: 1;
	padding: ${({ theme }) => `${theme.PAGE_MAIN_PADDING_Y} ${theme.PAGE_MAIN_PADDING_X}`};
`;

export const SiteWrapper = styled.View`
	flex-direction: row;
	align-items: center;
	padding: 5px;
`;

export const SiteTextWrapper = styled.View`
	flex: 1;
	flex-direction: column;
	padding: 5px;
`;

export const SiteStatusWrapper = styled.View`
	flex-direction: row;
`;

export const WpUserWrapper = styled.View``;
