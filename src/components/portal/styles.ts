import styled from 'styled-components/native';

type Props = { theme: import('../../lib/theme/types').ThemeProps };

export const StyledManagerView = styled.View<Props>`
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	height: 100%;
`;

export const StyledHostView = styled.View<Props>`
	flex: 1;
`;
