import { runtime, sheetColors, panelDesign } from '../runtime'
import { OverviewRows } from './OverviewRows'
import { ServerHeader } from './ServerHeader'
import { ServerRows } from './ServerRows'
import { FriendsRows } from './FriendsRows'
import { useGuildInfo } from './useGuildInfo'

export interface ServerInfoModalProps {
  guildId: string
  onClose(): void
  onPresented(): void
  onDismiss(): void
  onOpenProfile(options: Record<string, unknown>): void
  onCopyServerId(id: string): void
}

/** Mount a native bottom panel through Valenced's React alert host. */
export default function ServerInfoModal({ guildId, onClose, onPresented, onDismiss, onOpenProfile, onCopyServerId }: ServerInfoModalProps) {
  const { React, ReactNative: RN } = runtime.react
  const { View, Modal, ScrollView, Image, TouchableOpacity, ActivityIndicator } = RN
  const { Text } = runtime.discord.design.Design as any
  const dimensions = RN.useWindowDimensions?.() ?? RN.Dimensions.get('window')
  const height = Math.min(Math.max(220, dimensions.height * 0.86), dimensions.height - 24)
  const colors = sheetColors()
  const { guild, isLoading, ...info } = useGuildInfo(guildId)

  return (
    <Modal visible transparent animationType="slide" presentationStyle="overFullScreen"
      onRequestClose={onClose} onShow={onPresented} onDismiss={onDismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss server info"
          activeOpacity={1} onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        <View testID="info-commands-server-panel" accessibilityViewIsModal onAccessibilityEscape={onClose}
          onLayout={(event: any) => {
            const layout = event?.nativeEvent?.layout
            if (layout?.width > 0 && layout?.height > 0) onPresented()
          }}
          style={{ height, maxHeight: '100%', width: '100%', maxWidth: 640, alignSelf: 'center',
            backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28, gap: 18 }}
            nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {info.bannerUri && <Image accessibilityLabel="Server banner" source={{ uri: info.bannerUri }}
              style={{ width: '100%', height: 140, resizeMode: 'cover' }} />}
            <View style={{ paddingHorizontal: 16, paddingTop: info.bannerUri ? 0 : 8 }}>
              {guild ? <ServerHeader name={guild.name} description={guild.description} iconUri={info.iconUri} />
                : <Text variant="text-lg/semibold">Server Info</Text>}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close server info" onPress={onClose}
                style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 4 }}>
                <Text color="text-link">Close</Text>
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
      </View>
    </Modal>
  )
}
