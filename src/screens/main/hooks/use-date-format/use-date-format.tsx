import * as React from 'react';

import moment from 'moment-timezone';
import { interval } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { t } from '../../../../lib/translations'

/**
 *
 */
export const useDateFormat = (gmtDate: Date, format = 'MMMM D, YYYY', fromNow = true) => {
	const [formattedDate, setFormattedDate] = React.useState('');

  React.useEffect(() => {
    const updateDate = () => {
      const now = moment();
      const localDate = moment(gmtDate).tz(moment.tz.guess());
      const diffInMinutes = now.diff(localDate, 'minutes');
      const diffInHours = now.diff(localDate, 'hours');

      let newFormattedDate = '';

      if (diffInMinutes < 60) {
        newFormattedDate = t('{x} mins ago', { _tags: 'core', x: diffInMinutes });
      } else if (diffInHours < 24) {
        newFormattedDate = t('{x} hours ago', { _tags: 'core', x: diffInHours });
      } else {
        newFormattedDate = localDate.format(format);
      }

      setFormattedDate(newFormattedDate);
    };

    const source$ = interval(60000).pipe(startWith(0)); // Update every minute, starting immediately
    const subscription = source$.subscribe(() => updateDate());

    return () => subscription.unsubscribe();
  }, [gmtDate]);

  return formattedDate;
};
