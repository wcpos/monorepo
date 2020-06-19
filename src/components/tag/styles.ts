import styled from 'styled-components/native';

type TagProps = import('./tag').Props;

// eslint-disable-next-line import/prefer-default-export
export const Tag = styled.View<TagProps>`
	flex-direction: row;
	background-color: ${({ theme }) => theme.TAG_BACKGROUND_COLOR};
	border-radius: ${({ theme }) => theme.TAG_BORDER_RADIUS}
	padding: ${({ theme }) => `${theme.TAG_PADDING_Y} ${theme.TAG_PADDING_X}`};
`;
