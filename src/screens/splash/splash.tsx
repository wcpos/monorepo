import Logo from '@wcpos/components/src/logo';
import log from '@wcpos/utils/src/logger';
import * as React from 'react';

import * as Styled from './styles';

/**
 *
 */
export const Splash = () => {
	log.debug('splash render');

	return (
		<Styled.Container>
			<Logo />
		</Styled.Container>
	);
};
