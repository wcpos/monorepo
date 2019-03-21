import React from 'react';
import { createNavigator, StackRouter, SceneView } from '@react-navigation/core';
import Auth, { Modal } from '../sections/auth';

type NavigationView = import('react-navigation').NavigationView<{}, {}>;

const AuthView: NavigationView = ({ descriptors, navigation }) => {
	const activeKey = navigation.state.routes[navigation.state.index].key;
	const descriptor = descriptors[activeKey];
	return <SceneView component={descriptor.getComponent()} navigation={descriptor.navigation} />;
};

const AuthStack = createNavigator(
	AuthView,
	StackRouter(
		{
			Auth: {
				screen: Auth,
				path: '',
			},
			Modal: {
				screen: Modal,
				path: 'login',
			},
		},
		{}
	),
	{}
);

export default AuthStack;
