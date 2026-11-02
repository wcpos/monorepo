import { utc } from '@date-fns/utc';
import { format } from 'date-fns';

// Keep the original formatter: ISO slicing differs for years outside 0001–9999.
export const convertLocalDateToUTCString = (date: Date) =>
	format(date, "yyyy-MM-dd'T'HH:mm:ss", { in: utc });
