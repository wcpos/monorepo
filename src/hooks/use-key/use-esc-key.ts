import useKey from './use-key';

export default function useEscKey(callback: any) {
	// @ts-ignore
	return useKey(callback, ['esc']);
}
