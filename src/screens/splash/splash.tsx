import * as React from 'react';
import Logo from '@wcpos/common/src/components/logo';
import * as Styled from './styles';

/**
 *
 */
export const Splash = () => {
	console.log('splash render');

	return (
		<Styled.Container>
			<Logo />
		</Styled.Container>
	);
};
