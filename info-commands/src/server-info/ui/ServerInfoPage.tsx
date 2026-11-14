import { runtime, sheetColors, panelDesign } from '../runtime'
import { OverviewRows } from './OverviewRows'
import { ServerHeader } from './ServerHeader'
import { ServerRows } from './ServerRows'
import { useGuildInfo } from './useGuildInfo'
import { assetUrl, dateLabel } from '../data'
import { relationshipTabs, useServerRelationships, type RelationshipTab } from '../relationships'

type Tab = 'Overview' | RelationshipTab
const tabs: Tab[] = ['Overview', ...relationshipTabs]
const verificationLevels = ['None', 'Low', 'Medium', 'High', 'Highest']

export interface ServerInfoPageProps {
  guildId: string
  canRequest(): boolean
  BottomSafeArea?: any
  onClose(): void
  onOpenProfile(options: Record<string, unknown>): void
  onCopyServerId(id: string): void
  onCopyInvite(url: string): void
  onOpenImage(uri: string, width: number, height: number): void
}

/** Ordinary navigator content with no extra dialog window. */
export default function ServerInfoPage({ guildId, canRequest, BottomSafeArea, onClose, onOpenProfile, onCopyServerId,
  onCopyInvite, onOpenImage }: ServerInfoPageProps) {
  const { React, ReactNative: RN } = runtime.react
  const { View, ScrollView, FlatList, Image, TouchableOpacity, ActivityIndicator } = RN
  const { Text, TableRow, TableRowGroup } = panelDesign
  const colors = sheetColors()
  const [tab, setTab] = React.useState<Tab>('Overview')
  const { guild, isLoading, ...info } = useGuildInfo(guildId, false)
  const people = useServerRelationships(guildId, guild && tab !== 'Overview' ? tab : undefined, canRequest)
  const invite = typeof guild?.vanityCode === 'string' && /^[a-zA-Z0-9-]+$/.test(guild.vanityCode)
    ? `https://discord.gg/${guild.vanityCode}` : undefined
  const banner = assetUrl(`banners/${guildId}`, guild?.banner, 2048)
  const icon = assetUrl(`icons/${guildId}`, guild?.icon, 1024)

  const page = (
    <View testID="info-commands-server-page" style={{ flex: 1, backgroundColor: colors.background }}>
      {guild && <View accessibilityRole="tablist"
        style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 4, backgroundColor: colors.surface }}>
        {tabs.map(name => (
          <TouchableOpacity key={name} accessibilityRole="tab" accessibilityLabel={name}
            accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)}
            style={{ flexGrow: 1, paddingHorizontal: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center',
              borderBottomWidth: 2, borderBottomColor: tab === name ? colors.accent : 'transparent' }}>
            <Text variant="text-sm/semibold" color={tab === name ? 'text-link' : 'text-subtle'}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>}
      {guild && tab !== 'Overview' ? (
        <FlatList key={tab} data={people.rows} keyExtractor={item => item.userId} style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}
          ListHeaderComponent={<Text variant="text-sm/normal" color="text-subtle" style={{ marginBottom: 10 }}>
            {people.rows.length > 0 ? `${tab} in this server (${people.rows.length})` : `${tab} in this server`}
          </Text>}
          ListEmptyComponent={<Text color="text-subtle" style={{ paddingVertical: 16 }}>
            {people.pending ? 'Checking server membership…' : people.failed ? 'Could not check server membership. Switch tabs to retry.'
              : people.available ? 'No matching members found.' : 'This list is unavailable on this Discord version.'}
          </Text>}
          ListFooterComponent={people.rows.length > 0 && (people.pending
            ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
            : people.failed ? <Text color="text-subtle" style={{ marginTop: 12 }}>Some memberships could not be checked.</Text> : null)}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.surface }}>
              <TableRow label={item.label} subLabel={item.status}
                trailing={item.avatar ? <Image source={{ uri: item.avatar }} style={{ width: 32, height: 32, borderRadius: 16 }} /> : undefined}
                onPress={() => onOpenProfile({ userId: item.userId, guildId, ignoreBlockedSpeedBump: false })} />
            </View>
          )}
        />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16, gap: 18 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          {banner && <TouchableOpacity accessibilityRole="button" accessibilityLabel="View server banner"
            onPress={() => onOpenImage(banner, 2048, 1152)}>
            <Image source={{ uri: info.bannerUri }} style={{ width: '100%', height: 140, resizeMode: 'cover' }} />
          </TouchableOpacity>}
          {guild ? <>
            <View style={{ paddingHorizontal: 16, paddingTop: banner ? 0 : 4 }}>
              <ServerHeader name={guild.name} description={guild.description} iconUri={info.iconUri}
                onOpenIcon={icon ? () => onOpenImage(icon, 1024, 1024) : undefined} />
            </View>
            <OverviewRows {...info} design={panelDesign} />
            <ServerRows guildId={guildId} {...info} onOpenProfile={onOpenProfile} onCopyServerId={onCopyServerId} design={panelDesign} />
            <TableRowGroup title="Server settings">
              <TableRow label="Joined" trailing={<TableRow.TrailingText text={dateLabel(guild.joinedAt)} />} />
              <TableRow label="Preferred locale" trailing={<TableRow.TrailingText text={guild.preferredLocale} />} />
              <TableRow label="Verification level"
                trailing={<TableRow.TrailingText text={guild.verificationLevel == null ? undefined : verificationLevels[guild.verificationLevel]} />} />
              <TableRow label="Vanity invite"
                trailing={<TableRow.TrailingText text={invite ? invite.slice('https://'.length) : undefined} />}
                onPress={invite ? () => onCopyInvite(invite) : undefined} />
            </TableRowGroup>
            {info.cachedOnly && <Text color="text-subtle" style={{ paddingHorizontal: 16 }}>Showing cached server details.</Text>}
          </> : <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
            {isLoading && <ActivityIndicator size="large" color={colors.accent} />}
            <Text>{isLoading ? 'Loading server info…' : info.error ?? 'Server details are unavailable.'}</Text>
          </View>}
        </ScrollView>
      )}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close server info" onPress={onClose}
        style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, backgroundColor: colors.surface }}>
        <Text color="text-link" variant="text-md/semibold">Close</Text>
      </TouchableOpacity>
    </View>
  )
  return BottomSafeArea ? <BottomSafeArea edges={['bottom', 'left', 'right']}
    style={{ flex: 1, backgroundColor: colors.surface }}>{page}</BottomSafeArea> : page
}
