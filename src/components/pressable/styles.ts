import styled from 'styled-components/native';

type ThemeProps = { theme: import('../../lib/theme/types').ThemeProps };
type Props = import('./pressable').Props;

// eslint-disable-next-line import/prefer-default-export
export const Pressable = styled.Pressable<Props>`
	opacity: ${({ pressed }) => (pressed ? 0.5 : 1)};
`;
