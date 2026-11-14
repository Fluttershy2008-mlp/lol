import { Constants } from '@valenced/discord/common/constants'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { audio } from './audio'
import type { AudioDraft } from './audio'

export interface Channel {
	id: string
	guild_id?: string
	type: number
}

interface PendingReply {
	message?: { id: string }
	messageId?: string
	shouldMention?: boolean
}

interface UploadSlot {
	id: string | number
	upload_url: string
	upload_filename: string
}

type DiscordResponse<T> = { body: T }
type DiscordHTTP = {
	getAPIBaseURL(): string
	del: unknown
	post<T>(options: { url: string; body: object }): Promise<DiscordResponse<T>>
}

function selectedChannelId() {
	return (
		Stores.SelectedChannelStore as unknown as {
			getCurrentlySelectedChannelId(): string | undefined
		}
	)?.getCurrentlySelectedChannelId()
}

export function currentUserId() {
	return (
		Stores.UserStore as unknown as {
			getCurrentUser(): { id: string } | null
		}
	)?.getCurrentUser()?.id
}

export function canSendVoice(channel: Channel): boolean {
	if (!channel.guild_id) return channel.type === 1 || channel.type === 3
	const permissionStore = Stores.PermissionStore as unknown as {
		can(permission: bigint, channel: Channel): boolean
	}
	if (!permissionStore?.can) return false
	const isThread =
		channel.type === 10 || channel.type === 11 || channel.type === 12
	const sendPermission = isThread ? 1n << 38n : 1n << 11n
	return (
		permissionStore.can(sendPermission, channel) &&
		permissionStore.can(1n << 46n, channel)
	)
}

export function newNonce() {
	return (
		(BigInt(Date.now() - 1420070400000) << 22n) +
		BigInt(Math.floor(Math.random() * 4194304))
	).toString()
}

export async function sendVoice(
	channel: Channel,
	userId: string,
	draft: AudioDraft,
	nonce: string,
	isOpen: () => boolean,
) {
	const checkDestination = () => {
		if (
			!isOpen() ||
			selectedChannelId() !== channel.id ||
			currentUserId() !== userId
		) {
			throw new Error(
				'Open the original chat before sending this voice message.',
			)
		}
		if (!canSendVoice(channel))
			throw new Error('You can’t send voice messages in this chat.')
	}
	checkDestination()

	const http = lookupModule(
		withProps<DiscordHTTP>('post', 'getAPIBaseURL', 'del'),
	)[0]
	const knownEndpoints = Constants?.Endpoints as
		| {
				MESSAGES(channelId: string): string
				MESSAGE_CREATE_ATTACHMENT_UPLOAD(channelId: string): string
		  }
		| undefined
	const endpoints =
		knownEndpoints ??
		lookupModule(
			withProps<{
				Endpoints: {
					MESSAGES(channelId: string): string
					MESSAGE_CREATE_ATTACHMENT_UPLOAD(channelId: string): string
				}
			}>('Endpoints'),
		)[0]?.Endpoints
	if (!http?.post || !endpoints?.MESSAGES) {
		throw new Error(
			'Discord’s message uploader is unavailable on this version.',
		)
	}

	const replies = Stores.PendingReplyStore as unknown as {
		getPendingReply(channelId: string): PendingReply | undefined
	}
	const pending = replies?.getPendingReply?.(channel.id)
	const messageId = pending?.message?.id ?? pending?.messageId
	if (pending && !messageId) {
		throw new Error(
			'Discord couldn’t resolve the reply for this voice message.',
		)
	}

	const { body } = await http.post<{ attachments: UploadSlot[] }>({
		url:
			endpoints.MESSAGE_CREATE_ATTACHMENT_UPLOAD?.(channel.id) ??
			`/channels/${channel.id}/attachments`,
		body: {
			files: [{ id: '0', filename: draft.filename, file_size: draft.size }],
		},
	})
	const slot = body?.attachments?.[0]
	if (!slot?.upload_url || !slot.upload_filename) {
		throw new Error('Discord didn’t return an audio upload URL.')
	}

	checkDestination()
	await audio.upload(draft, slot.upload_url)
	checkDestination()
	await http.post({
		url: endpoints.MESSAGES(channel.id),
		body: {
			content: '',
			flags: 1 << 13,
			nonce,
			enforce_nonce: true,
			attachments: [
				{
					id: String(slot.id),
					filename: draft.filename,
					uploaded_filename: slot.upload_filename,
					duration_secs: draft.duration,
					waveform: draft.waveform,
				},
			],
			...(messageId && {
				message_reference: {
					message_id: messageId,
					channel_id: channel.id,
					guild_id: channel.guild_id,
				},
				allowed_mentions: {
					parse: [],
					replied_user: pending?.shouldMention === true,
				},
			}),
		},
	})
	try {
		if (pending && replies.getPendingReply(channel.id) === pending) {
			lookupModule(
				withProps<{
					deletePendingReply(channelId: string): void
				}>('deletePendingReply'),
			)[0]?.deletePendingReply(channel.id)
		}
	} catch {
		// The message is already delivered.
	}
}
