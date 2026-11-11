import {
	addCurrentAccount,
	addAccountWithToken,
	addAccountWithCredentials,
} from '../lib/accountActions'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { Avatar, getValenced, Glyph, useCurrentAccount, usePalette } from './AccountUi'

const sheetKey = 'more-alts-add-account'

export function openAddAccountSheet(
	storage: any,
	onDone?: () => void,
) {
	const rev = getValenced()
	const actions = rev?.discord?.actions?.ActionSheetActionCreators
	if (!actions?.openLazy) return

	actions.openLazy(
		Promise.resolve({
			default: () => {
				const React = rev.react.React
				const { View, ScrollView, Text } = rev.react.ReactNative
				const {
					ActionSheet,
					BottomSheetTitleHeader,
					ActionSheetCloseButton,
					TableRowGroup,
					TableRow,
					Stack,
					Button,
					TextInput,
				} = rev.discord.design.Design as any

				const [mode, setMode] = React.useState<'choose' | 'credentials' | 'token'>('choose')
				const [email, setEmail] = React.useState('')
				const [password, setPassword] = React.useState('')
				const [token, setToken] = React.useState('')
				const [statusMsg, setStatusMsg] = React.useState<string | null>(null)
				const [loading, setLoading] = React.useState(false)
				const colors = usePalette()
				const currentUser = useCurrentAccount()
				const bottomPadding = useBottomPadding(16)
				const close = () => actions.hideActionSheet(sheetKey)

				const handleAddCurrent = async () => {
					setLoading(true)
					setStatusMsg(null)
					const res = await addCurrentAccount(storage)
					setLoading(false)
					if (res.success) {
						onDone?.()
						close()
					} else {
						setStatusMsg(res.message)
					}
				}

				const handleAddCredentials = async () => {
					setLoading(true)
					setStatusMsg(null)
					const res = await addAccountWithCredentials(storage, email, password)
					setLoading(false)
					if (res.success) {
						onDone?.()
						close()
					} else {
						setStatusMsg(res.message)
					}
				}

				const handleAddToken = async () => {
					setLoading(true)
					setStatusMsg(null)
					const res = await addAccountWithToken(storage, token)
					setLoading(false)
					if (res.success) {
						onDone?.()
						close()
					} else {
						setStatusMsg(res.message)
					}
				}

				const handlePasteToken = async () => {
					try {
						const clip = rev.discord?.common?.Clipboard ?? rev.externals?.ReactNativeClipboard
						if (clip?.getString) {
							const text = await clip.getString()
							if (text) setToken(text.trim())
						}
					} catch {}
				}

				return (
					<ActionSheet>
						<BottomSheetTitleHeader
							title="Add Account"
							trailing={
								<ActionSheetCloseButton
									onPress={close}
								/>
							}
						/>
						<ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled"
							contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: bottomPadding }}>
							<Stack spacing={16}>
								{statusMsg && (
									<View
										style={{
											backgroundColor: colors.mutedPanel,
											borderRadius: 12,
											padding: 12,
											borderWidth: 1,
											borderColor: colors.line,
										}}
									>
										<Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 14, fontWeight: '600' }}>
											{statusMsg}
										</Text>
									</View>
								)}

								{mode === 'choose' && (
									<>
										<TableRowGroup title="Current Discord session">
											<TableRow
												label="Save Currently Logged-in Account"
												subLabel={currentUser?.username ? `@${currentUser.username}` : 'Save the account active in Discord.'}
												icon={<Avatar user={currentUser} size={34} border={colors.line} />}
												onPress={handleAddCurrent}
												disabled={loading}
												arrow
											/>
										</TableRowGroup>

										<TableRowGroup title="Other sign-in options">
											<TableRow
												label="Sign in with Email & Password"
												subLabel="Use an email address or phone number."
												icon={<Glyph names={['EnvelopeIcon', 'MailIcon']} color={colors.muted} />}
												disabled={loading}
												onPress={() => {
													setStatusMsg(null)
													setMode('credentials')
												}}
												arrow
											/>
											<TableRow
												label="Add with Token"
												subLabel="Use a Discord user or bot token."
												icon={<Glyph names={['KeyIcon', 'LockIcon']} color={colors.muted} />}
												disabled={loading}
												onPress={() => {
													setStatusMsg(null)
													setMode('token')
												}}
												arrow
											/>
										</TableRowGroup>
									</>
								)}

								{mode === 'credentials' && (
									<>
										<TableRowGroup title="Discord credentials">
											<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
												<TextInput
													label="Email or Phone"
													value={email}
													onChange={(t: string) => setEmail(t)}
													placeholder="user@example.com"
													keyboardType="email-address"
													editable={!loading}
												/>
												<TextInput
													label="Password"
													value={password}
													onChange={(t: string) => setPassword(t)}
													placeholder="••••••••••••"
													secureTextEntry
													editable={!loading}
												/>
											</View>
										</TableRowGroup>

										<View style={{ flexDirection: 'row', gap: 10 }}>
											<Button
												variant="secondary"
												text="Back"
												onPress={() => setMode('choose')}
												style={{ flex: 1 }}
											/>
											<Button
												variant="primary"
												text={loading ? 'Logging in...' : 'Sign In'}
												onPress={handleAddCredentials}
												disabled={loading || !email.trim() || !password.trim()}
												style={{ flex: 2 }}
											/>
										</View>
									</>
								)}

								{mode === 'token' && (
									<>
										<TableRowGroup title="Authentication token">
											<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
												<TextInput
													label="Discord Token"
													value={token}
													onChange={(t: string) => setToken(t)}
													placeholder="Paste user or bot token..."
													secureTextEntry
													editable={!loading}
												/>
												<Button
													size="sm"
													variant="secondary"
													text="Paste from Clipboard"
													onPress={handlePasteToken}
												/>
											</View>
										</TableRowGroup>

										<View style={{ flexDirection: 'row', gap: 10 }}>
											<Button
												variant="secondary"
												text="Back"
												onPress={() => setMode('choose')}
												style={{ flex: 1 }}
											/>
											<Button
												variant="primary"
												text={loading ? 'Adding...' : 'Add Account'}
												onPress={handleAddToken}
												disabled={loading || !token.trim()}
												style={{ flex: 2 }}
											/>
										</View>
									</>
								)}
							</Stack>
						</ScrollView>
					</ActionSheet>
				)
			},
		}),
		sheetKey,
		{},
		'replaceTopSheet',
	)
}
