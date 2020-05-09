import React from 'react';
import PageLayout from '../../layout/page';
import Logo from '../../components/logo';
import Button from '../../components/button';
import useUser from '../../hooks/use-user';
import { SplashView } from './styles';

interface Props {
	onReady: () => void;
}

const Splash: React.FC<Props> = ({ onReady }) => {
	const { setUser } = useUser();
	// React.useEffect(() => {
	// 	const timer = setTimeout(() => {
	// 		typeof onReady === 'function' && onReady();
	// 	}, 2000);
	// 	return () => clearTimeout(timer);
	// }, [onReady]);

	return (
		<PageLayout>
			<SplashView>
				<Logo />
				<Button
					onPress={() => {
						setUser({});
					}}
					title="Empty User"
				/>
				<Button
					onPress={() => {
						setUser({ authenticated: false });
					}}
					title="Unauthenticated User"
				/>
				<Button
					onPress={() => {
						setUser({ authenticated: true });
					}}
					title="Authenticated User"
				/>
			</SplashView>
		</PageLayout>
	);
};

export default Splash;
