import * as React from 'react';
import PageLayout from '@wcpos/common/src/layout/page';
import Logo from '@wcpos/common/src/components/logo';
import * as Styled from './styles';

/**
 *
 */
export const Splash = () => {
	console.log('splash render');

	return (
		<PageLayout>
			<Styled.View>
				<Logo />
			</Styled.View>
		</PageLayout>
	);
};

export const MemoizedSplash = React.memo(Splash);
