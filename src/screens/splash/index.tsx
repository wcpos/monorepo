import * as React from 'react';

import Logo from '@wcpos/components/src/logo';
import log from '@wcpos/utils/src/logger';

import * as Styled from './styles';

/**
 *
 */
const Splash = () => {
	log.debug('splash render');

	return (
		<Styled.Container>
			<Logo width={150} height={150} />
		</Styled.Container>
	);
};

export default Splash;
