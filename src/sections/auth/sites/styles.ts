import styled from 'styled-components/native';

type ThemeProps = import('../../../lib/theme/types').ThemeProps;

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

export const UserWrapper = styled.View<{ theme: ThemeProps }>`
	flex-direction: row;
	align-items: center;
	padding: 5px;
`;
