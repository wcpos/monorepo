import { generateId } from 'rxdb';

/**
 * Piggy back of rxdb id generation
 */
export default function genId(): string {
	return generateId().split(':')[0];
}
