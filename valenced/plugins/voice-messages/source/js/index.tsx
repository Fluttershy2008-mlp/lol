import { getAssetIdByName } from '@valenced/assets'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'
import {
	AppState,
	Image,
	PermissionsAndroid,
	Platform,
	StyleSheet,
	View,
} from 'react-native'
import { audio, audioError, importAudio } from './audio'
import { canSendVoice, currentUserId, newNonce, sendVoice } from './send'
import type { ComponentType } from 'react'
import type { ImageProps } from 'react-native'
import type { AudioDraft } from './audio'
import type { Channel } from './send'

const alertKey = 'rosie.voice-messages'
const voiceButtonPath =
	'modules/voice_messages/native/components/VoiceMessageButton.tsx'
const actionButtonPath =
	'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'

type VoiceButtonProps = {
	channelId: string
	disabled?: boolean
}

type ActionButtonProps = {
	IconComponent: ComponentType<ImageProps>
	accessibilityLabel: string
	onPress: () => void
}

export default plugin({
	start({ cleanup }) {
		if (Platform.OS !== 'android') return
		cleanup(
			getModuleWithImportedPath<{ default: ComponentType<VoiceButtonProps> }>(
				voiceButtonPath,
				({ default: VoiceButton }) => {
					if (!VoiceButton) return
					cleanup(
						afterJSX(VoiceButton, element => {
							if (element.props.disabled) return element
							const channelStore = Stores.ChannelStore as unknown as {
								getChannel(channelId: string): Channel | undefined
							}
							const channel = channelStore?.getChannel(element.props.channelId)
							if (!channel || !canSendVoice(channel)) return element

							const [module] = lookupModuleWithImportedPath<{
								default: ComponentType<ActionButtonProps>
							}>(actionButtonPath)
							const ActionButton = module?.default
							if (!ActionButton || !microphoneAsset()) return element

							const open = () => {
								const userId = currentUserId()
								if (userId && canSendVoice(channel)) {
									AlertActionCreators.openAlert(
										alertKey,
										<VoicePanel channel={channel} userId={userId} />,
									)
								}
							}
							return (
								<ActionButton
									key={element.key}
									IconComponent={MicrophoneIcon}
									accessibilityLabel="Send voice message"
									onPress={open}
								/>
							)
						}),
					)
				},
			),
			() => AlertActionCreators.dismissAlert(alertKey),
		)
	},
})

function microphoneAsset() {
	return (
		getAssetIdByName('MicrophoneIcon') || getAssetIdByName('VoiceMessageIcon')
	)
}

function MicrophoneIcon({ style }: ImageProps) {
	return <Image source={microphoneAsset()} style={style} />
}

function VoicePanel({ channel, userId }: { channel: Channel; userId: string }) {
	const [draft, setDraft] = useState<AudioDraft>()
	const [recording, setRecording] = useState<string>()
	const [playing, setPlaying] = useState(false)
	const [busy, setBusy] = useState('')
	const [status, setStatus] = useState('')
	const [elapsed, setElapsed] = useState(0)
	const open = useRef(true)
	const lock = useRef(false)
	const files = useRef(new Set<string>())
	const recordingId = useRef<string | undefined>(undefined)
	const nonce = useRef('')
	const startedAt = useRef(0)

	useEffect(() => {
		open.current = true
		const cachedFiles = files.current
		const app = AppState.addEventListener('change', state => {
			if (state !== 'active' && recordingId.current) {
				const id = recordingId.current
				recordingId.current = undefined
				void audio.discard(id).catch(() => {})
				cachedFiles.delete(id)
				setRecording(undefined)
				setStatus('Recording ended when Discord went into the background.')
			}
		})
		return () => {
			open.current = false
			app.remove()
			for (const id of cachedFiles) void audio.discard(id).catch(() => {})
			cachedFiles.clear()
		}
	}, [])

	useEffect(() => {
		if (!playing || !draft) return
		const timer = setInterval(() => {
			audio
				.playing(draft.id)
				.then(active => {
					if (!active && open.current) setPlaying(false)
				})
				.catch(() => {
					if (open.current) setPlaying(false)
				})
		}, 300)
		return () => clearInterval(timer)
	}, [playing, draft])

	useEffect(() => {
		if (!recording) return
		const timer = setInterval(() => {
			setElapsed(
				Math.min(
					1200,
					Math.floor((performance.now() - startedAt.current) / 1000),
				),
			)
		}, 250)
		return () => clearInterval(timer)
	}, [recording])

	const run = async (label: string, task: () => Promise<void>) => {
		if (!open.current || lock.current) return
		lock.current = true
		setBusy(label)
		setStatus('')
		try {
			await task()
		} catch (error) {
			if (open.current)
				setStatus(audioError(error, 'Something went wrong. Please try again.'))
		} finally {
			lock.current = false
			if (open.current) setBusy('')
		}
	}

	const keepDraft = (next: AudioDraft) => {
		if (!open.current) {
			void audio.discard(next.id).catch(() => {})
			return
		}
		if (draft && draft.id !== next.id) {
			void audio.discard(draft.id).catch(() => {})
			files.current.delete(draft.id)
		}
		files.current.add(next.id)
		nonce.current = newNonce()
		setDraft(next)
	}

	const stopPreview = async () => {
		if (draft && playing) {
			await audio.stopPreview(draft.id)
			if (open.current) setPlaying(false)
		}
	}

	const record = () =>
		run('Starting microphone…', async () => {
			if (Number(Platform.Version) < 29) {
				throw new Error(
					'Recording here requires Android 10. You can still choose an audio file.',
				)
			}
			await stopPreview()
			const permission = await PermissionsAndroid.request(
				PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
			)
			if (!open.current) return
			if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
				throw new Error(
					'Allow Discord to use the microphone to record a voice message.',
				)
			}
			const id = await audio.record()
			if (
				!open.current ||
				(AppState.currentState && AppState.currentState !== 'active')
			) {
				await audio.discard(id)
				return
			}
			files.current.add(id)
			recordingId.current = id
			startedAt.current = performance.now()
			setElapsed(0)
			setRecording(id)
		})

	const finish = () =>
		run('Preparing recording…', async () => {
			const id = recordingId.current
			if (!id) return
			recordingId.current = undefined
			setRecording(undefined)
			try {
				keepDraft(await audio.finish(id))
			} catch (error) {
				files.current.delete(id)
				throw error
			}
		})

	const choose = () =>
		run('Opening audio file…', async () => {
			await stopPreview()
			const next = await importAudio()
			if (next) keepDraft(next)
		})

	const preview = () =>
		run('Opening preview…', async () => {
			if (!draft) return
			if (playing) {
				await stopPreview()
			} else {
				await audio.play(draft.id)
				if (open.current) setPlaying(true)
			}
		})

	const send = () =>
		run('Sending voice message…', async () => {
			if (!draft) return
			await stopPreview()
			await sendVoice(channel, userId, draft, nonce.current, () => open.current)
			if (open.current) AlertActionCreators.dismissAlert(alertKey)
		})
	const time = recording ? elapsed : draft?.duration
	const description = recording
		? 'Recording…'
		: draft
			? 'Preview'
			: 'Record with your microphone or choose an audio file.'
	const notice =
		status ||
		busy ||
		(draft && !draft.isOggOpus
			? 'Use Ogg Opus for playback on iPhone and iPad.'
			: '')

	return (
		<Design.AlertModal
			title="Send voice message"
			content={description}
			extraContent={
				<View style={styles.panel}>
					{time !== undefined && (
						<Design.Text variant="text-sm/medium">
							{formatTime(time)}
						</Design.Text>
					)}
					{draft && !recording && (
						<View
							accessibilityElementsHidden
							importantForAccessibility="no-hide-descendants"
							style={styles.waveform}
						>
							{draft.bars.map((bar, index) => (
								<View
									key={index}
									style={[
										styles.bar,
										{
											height: 3 + (27 * bar) / 255,
											opacity: playing ? 1 : 0.65,
										},
									]}
								/>
							))}
						</View>
					)}
					{notice ? (
						<Design.Text
							variant="text-sm/medium"
							accessibilityLiveRegion="polite"
						>
							{notice}
						</Design.Text>
					) : null}
					{recording ? (
						<Design.Button
							text="Stop recording"
							disabled={!!busy}
							onPress={finish}
						/>
					) : (
						<>
							<Design.Button
								text={draft ? 'Record again' : 'Record'}
								variant="secondary"
								disabled={!!busy}
								onPress={record}
							/>
							<Design.Button
								text="Choose audio file"
								variant="secondary"
								disabled={!!busy}
								onPress={choose}
							/>
							{draft && (
								<Design.Button
									text={playing ? 'Stop preview' : 'Play preview'}
									variant="secondary"
									disabled={!!busy}
									onPress={preview}
								/>
							)}
						</>
					)}
				</View>
			}
			actions={
				<>
					<Design.AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={() => {
							open.current = false
							AlertActionCreators.dismissAlert(alertKey)
						}}
					/>
					<Design.AlertActionButton
						text="Send"
						variant="primary"
						disabled={!draft || !!recording || !!busy}
						onPress={send}
					/>
				</>
			}
		/>
	)
}

function formatTime(seconds: number) {
	const whole = Math.floor(seconds)
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

const styles = StyleSheet.create({
	panel: { gap: 8 },
	waveform: { height: 32, gap: 2, flexDirection: 'row', alignItems: 'center' },
	bar: { flex: 1, maxWidth: 8, borderRadius: 3, backgroundColor: '#5865F2' },
})
