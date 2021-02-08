import * as React from 'react';
import PageLayout from '../../layout/page';
import Logo from '../../components/logo';
import * as Styled from './styles';

interface Props {}

/**
 * @TODO do you really need a splash page??
 */
const Splash: React.FC<Props> = () => {
	return (
		<PageLayout>
			<Styled.Splash>
				<Logo />
			</Styled.Splash>
		</PageLayout>
	);
};

export default Splash;
