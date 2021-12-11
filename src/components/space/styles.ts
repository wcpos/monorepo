import styled from 'styled-components/native';

type SpaceProps = import('./space').SpaceProps;

export const Space = styled.View<SpaceProps>`
	height: ${({ theme, value }) => theme.spacing[value]}px;
	width: ${({ theme, value }) => theme.spacing[value]}px;
`;
