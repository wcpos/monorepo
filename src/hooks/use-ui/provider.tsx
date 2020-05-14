import React, { createContext, useState, useEffect, useReducer } from 'react';
import reducer from './reducer';
import initialState from './initial';

export const Context = createContext();

type Props = {
	children: React.ReactNode;
};

/**
 *
 */
const UiProvider: React.FC<Props> = ({ children }) => {
	// const [ui, setUI] = useState();
	const [state, dispatch] = useReducer(reducer, initialState);
	const [contextValue, setContextValue] = useState({ state, dispatch });

	// Update context value and trigger re-render
	// This patterns avoids unnecessary deep renders
	// https://reactjs.org/docs/context.html#caveats
	useEffect(() => {
		setContextValue({ ...contextValue, state });
	}, [state]); // eslint-disable-line react-hooks/exhaustive-deps

	// useEffect(() => {
	// 	dispatch({});
	// }, []); // eslint-disable-line react-hooks/exhaustive-deps

	// const logout = () => {
	// 	console.log('logout');
	// };

	// // bootstrap sites on mount
	// useEffect(() => {
	// 	const fetchUI = async () => {

	// 		setUI();
	// 	};

	// 	fetchUI();
	// }, []);

	return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

export default UiProvider;
