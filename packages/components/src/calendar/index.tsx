import React from 'react';

import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';

export const Calendar = () => {
	const [selected, setSelected] = React.useState('');

	return (
		<RNCalendar
			onDayPress={(day) => {
				setSelected(day.dateString);
			}}
			markedDates={{
				[selected]: { selected: true, disableTouchEvent: true, selectedDotColor: 'orange' },
			}}
		/>
	);
};
