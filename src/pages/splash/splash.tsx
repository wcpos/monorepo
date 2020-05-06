import React from 'react';
import PageLayout from '../../layout/page';
import Logo from '../../components/logo';
import { SplashView } from './styles';

interface Props {
	onReady: () => void;
}

const Splash: React.FC<Props> = ({ onReady }) => {
	React.useEffect(() => {
		const timer = setTimeout(() => {
			typeof onReady === 'function' && onReady();
		}, 2000);
		return () => clearTimeout(timer);
	}, [onReady]);

	return (
		<PageLayout>
			<SplashView>
				<Logo />
			</SplashView>
		</PageLayout>
	);
};

export default Splash;
