const reducer = (state, action) => {
	switch (action.type) {
		case 'UI_UPDATE':
			return { ...state, ...action.payload };
		default:
			return state;
	}
};

export default reducer;
