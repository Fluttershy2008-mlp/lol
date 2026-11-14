import { callNativeMethod, getNativeModule } from '@valenced/modules/native'

export interface AudioDraft {
	id: string
	filename: string
	mimeType: string
	size: number
	duration: number
	waveform: string
	bars: number[]
	isOggOpus: boolean
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'rosie.voice-messages.record': [[], string]
		'rosie.voice-messages.finish': [[string], AudioDraft]
		'rosie.voice-messages.import': [[string, string], AudioDraft]
		'rosie.voice-messages.play': [[string], boolean]
		'rosie.voice-messages.playing': [[string], boolean]
		'rosie.voice-messages.stopPreview': [[string], boolean]
		'rosie.voice-messages.discard': [[string], boolean]
		'rosie.voice-messages.upload': [[string, string, string], boolean]
	}
}

export const audio = {
	record: () => callNativeMethod('rosie.voice-messages.record', []),
	finish: (id: string) => callNativeMethod('rosie.voice-messages.finish', [id]),
	play: (id: string) => callNativeMethod('rosie.voice-messages.play', [id]),
	playing: (id: string) =>
		callNativeMethod('rosie.voice-messages.playing', [id]),
	stopPreview: (id: string) =>
		callNativeMethod('rosie.voice-messages.stopPreview', [id]),
	discard: (id: string) =>
		callNativeMethod('rosie.voice-messages.discard', [id]),
	upload: (draft: AudioDraft, url: string) =>
		callNativeMethod('rosie.voice-messages.upload', [
			draft.id,
			url,
			draft.mimeType,
		]),
}

type PickedFile = { uri: string; name?: string }

interface Picker {
	pick(options: {
		mode: 'open'
		type: string[]
		allowMultiSelection: boolean
		requestLongTermAccess: boolean
		allowVirtualFiles: boolean
		localOnly: boolean
	}): Promise<PickedFile[]>
}

export async function importAudio(): Promise<AudioDraft | undefined> {
	const picker = getNativeModule<Picker>('RNDocumentPicker')
	if (!picker) throw new Error('Discord’s file picker is unavailable.')

	let file: PickedFile | undefined
	try {
		const files = await picker.pick({
			mode: 'open',
			type: ['audio/*', 'application/ogg'],
			allowMultiSelection: false,
			requestLongTermAccess: false,
			allowVirtualFiles: false,
			localOnly: false,
		})
		file = files[0]
	} catch (error) {
		const reason = error as { code?: string; message?: string }
		if (
			/cancel/i.test(reason?.code ?? '') ||
			/cancel/i.test(reason?.message ?? '')
		)
			return
		throw error
	}
	if (file?.uri) {
		return callNativeMethod('rosie.voice-messages.import', [
			file.uri,
			file.name ?? '',
		])
	}
}

export function audioError(error: unknown, fallback: string): string {
	if (error instanceof Error) {
		return error.message
			.split('\n', 1)[0]
			.replace(/^Call failed: (?:[\w.$]+: )?/, '')
	}
	if (error && typeof error === 'object' && 'body' in error) {
		const body = error.body as { message?: unknown } | undefined
		if (typeof body?.message === 'string') return body.message
	}
	return fallback
}
