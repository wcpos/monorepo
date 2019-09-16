import useKey from './use-key';

export default function useEscKey(callback) {
	return useKey(callback, ['esc']);
}
