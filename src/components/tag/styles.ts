import styled from 'styled-components/native';

type TagProps = import('./tag').Props;

// eslint-disable-next-line import/prefer-default-export
export const Tag = styled.View<TagProps>`
	background-color: ${({ theme }) => theme.TAG_BACKGROUND_COLOR};
`;
