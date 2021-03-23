import styled from 'styled-components/native';

export const AuthView = styled.View`
	align-items: center;
	justify-content: center;
	flex: 1;
	background-color: ${(props) => props.theme.APP_BACKGROUND_COLOR};
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
