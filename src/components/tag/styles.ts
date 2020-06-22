import styled from 'styled-components/native';

type TagProps = import('./tag').Props;

// eslint-disable-next-line import/prefer-default-export
export const Tag = styled.View<Pick<TagProps, 'disabled'>>`
	flex-direction: row;
	background-color: ${({ theme, disabled }) =>
		disabled ? theme.TAG_BACKGROUND_DISABLED : theme.TAG_BACKGROUND_COLOR};
	border-radius: ${({ theme }) => theme.TAG_BORDER_RADIUS}
	padding: ${({ theme }) => `${theme.TAG_PADDING_Y} ${theme.TAG_PADDING_X}`};
`;
