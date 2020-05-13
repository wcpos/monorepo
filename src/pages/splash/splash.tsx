import React from 'react';
import PageLayout from '../../layout/page';
import Logo from '../../components/logo';
import Button from '../../components/button';
import useUser from '../../hooks/use-user';
import { SplashView } from './styles';

interface Props {}

/**
 * @TODO do you really need a splash page??
 */
const Splash: React.FC<Props> = () => {
	const { setUser } = useUser();

	React.useEffect(() => {
		const timer = setTimeout(() => {
			setUser({ authenticated: true });
		}, 1000);
		return () => clearTimeout(timer);
	}, []);

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
