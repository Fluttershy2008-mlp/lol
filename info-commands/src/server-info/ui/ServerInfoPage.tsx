import { runtime, sheetColors, panelDesign } from '../runtime'
import { OverviewRows } from './OverviewRows'
import { ServerHeader } from './ServerHeader'
import { ServerRows } from './ServerRows'
import { FriendsRows } from './FriendsRows'
import { useGuildInfo } from './useGuildInfo'

export interface ServerInfoPageProps {
  guildId: string
  onClose(): void
  onOpenProfile(options: Record<string, unknown>): void
  onCopyServerId(id: string): void
}

/** Ordinary navigator content: no alert host, native Modal or extra backdrop. */
export default function ServerInfoPage({ guildId, onClose, onOpenProfile, onCopyServerId }: ServerInfoPageProps) {
  const { React, ReactNative: RN } = runtime.react
  const { View, ScrollView, Image, TouchableOpacity, ActivityIndicator } = RN
  const { Text } = runtime.discord.design.Design as any
  const colors = sheetColors()
  const { guild, isLoading, ...info } = useGuildInfo(guildId)
  return (
    <View testID="info-commands-server-page" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32, gap: 18 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
        {info.bannerUri && <Image accessibilityLabel="Server banner" source={{ uri: info.bannerUri }}
          style={{ width: '100%', height: 140, resizeMode: 'cover' }} />}
        <View style={{ paddingHorizontal: 16, paddingTop: info.bannerUri ? 0 : 8 }}>
          {guild ? <ServerHeader name={guild.name} description={guild.description} iconUri={info.iconUri} />
            : <Text variant="text-lg/semibold">Server Info</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close server info" onPress={onClose}
            style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 4 }}>
            <Text color="text-link" onPress={onClose} accessibilityRole="button">Close</Text>
          </TouchableOpacity>
        </View>
        {guild ? <>
          <OverviewRows {...info} design={panelDesign} />
          <ServerRows guildId={guildId} {...info} onOpenProfile={onOpenProfile} onCopyServerId={onCopyServerId} design={panelDesign} />
          <FriendsRows guildId={guildId} friends={info.friends} loading={info.friendsPending} onOpenProfile={onOpenProfile} design={panelDesign} />
          {info.cachedOnly && <Text color="text-subtle" style={{ paddingHorizontal: 16 }}>Showing cached server details.</Text>}
        </> : <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
          {isLoading && <ActivityIndicator size="large" color="#5865f2" />}
          <Text>{isLoading ? 'Loading server info…' : info.error ?? 'Server details are unavailable.'}</Text>
        </View>}
      </ScrollView>
    </View>
  )
}
