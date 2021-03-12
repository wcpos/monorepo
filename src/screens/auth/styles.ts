import styled from 'styled-components/native';

type ThemeProps = import('../../lib/theme').ThemeProps;

export const AuthView = styled.View<{ theme: ThemeProps }>`
	align-items: center;
	justify-content: center;
	flex: 1;
	background-color: ${(props) => props.theme.APP_BACKGROUND_COLOR};
`;

export const SiteWrapper = styled.View<{ theme: ThemeProps }>`
	flex-direction: row;
	align-items: center;
	padding: 5px;
`;

export const SiteTextWrapper = styled.View<{ theme: ThemeProps }>`
	flex: 1;
	flex-direction: column;
	padding: 5px;
`;
