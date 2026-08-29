import { toast } from 'sonner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import {
  triggerSysProxy,
  updateTrayIcon,
  mihomoHotReloadConfig,
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoProxyDelay
} from '@renderer/utils/ipc'
import NumberFlow from '@number-flow/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import HomeConnectionGlobe from '@renderer/components/home/home-connection-globe'
import {
  InfinityIcon,
  WifiOff,
  PlusCircle,
  Globe,
  ArrowUp,
  RefreshCcw,
  ArrowDown,
  ChevronsUpDown,
  Check,
  Gauge
} from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import { FiUser } from 'react-icons/fi'
import EditInfoModal from '@renderer/components/profiles/edit-info-modal'
import { Spinner } from '@renderer/components/ui/spinner'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { CharacterMorph } from '@renderer/components/ui/character-morph'
import { calcTraffic } from '@renderer/utils/calc'
import { useTrafficStore } from '@renderer/store/traffic-store'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

function proxyDelay(proxy: ControllerProxiesDetail | ControllerGroupDetail): number {
  if (proxy.history.length > 0) {
    return proxy.history[proxy.history.length - 1].delay
  }
  return -1
}

function delayColorClass(delay: number): string {
  if (delay === -1) return 'text-muted-foreground'
  if (delay === 0) return 'text-destructive'
  if (delay < 500) return 'text-success'
  return 'text-warning'
}

// Module-level variable: persists across component mounts/unmounts
let connectionStartTime: number | null = null

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false,
    autoCloseConnection = true
  } = appConfig || {}
  const { enable: writeSysProxy = true, mode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig, addProfileItem } = useProfileConfig()
  const { groups, mutate: mutateGroups } = useGroups()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ProfileItem | null>(null)
  const [updating, setUpdating] = useState(false)

  const handleAddProfile = (): void => {
    const newProfile: ProfileItem = {
      id: '',
      name: '',
      type: 'remote',
      url: '',
      useProxy: false,
      autoUpdate: true
    }
    setEditingItem(newProfile)
    setShowEditModal(true)
  }

  const trafficInfo = useTrafficStore((s) => s.traffic)

  const [loading, setLoading] = useState(false)
  const [loadingDirection, setLoadingDirection] = useState<'connecting' | 'disconnecting'>(
    'connecting'
  )

  const [elapsed, setElapsed] = useState(() => {
    if (connectionStartTime !== null) {
      return Math.floor((Date.now() - connectionStartTime) / 1000)
    }
    return 0
  })

  const isSelected = (tun?.enable ?? false) || proxyMode

  useEffect(() => {
    if (isSelected) {
      if (connectionStartTime === null) {
        connectionStartTime = Date.now()
      }
      setElapsed(Math.floor((Date.now() - connectionStartTime) / 1000))
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - connectionStartTime!) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else {
      connectionStartTime = null
      setElapsed(0)
      return undefined
    }
  }, [isSelected])

  const isDisabled =
    loading ||
    (mainSwitchMode === 'sysproxy' && writeSysProxy && mode == 'manual' && sysProxyDisabled)

  const status = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : isSelected
      ? t('pages.home.connected')
      : t('pages.home.disconnected')
  const statusWidthTexts = [
    t('pages.home.connecting'),
    t('pages.home.disconnecting'),
    t('pages.home.connected'),
    t('pages.home.disconnected')
  ]
  const showConnectedTimer = !loading && isSelected
  const elapsedHours = Math.floor(elapsed / 3600)
  const elapsedMinutes = Math.floor((elapsed % 3600) / 60)
  const elapsedSeconds = elapsed % 60

  // Current profile & subscription
  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const handleUpdateProfile = async (): Promise<void> => {
    if (!currentProfile || updating) return
    setUpdating(true)
    try {
      await addProfileItem(currentProfile)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setUpdating(false)
    }
  }

  const subscription = currentProfile?.extra
  const trafficUsed = (subscription?.upload ?? 0) + (subscription?.download ?? 0)
  const trafficTotal = subscription?.total ?? 0
  const trafficRemaining = trafficTotal > 0 ? trafficTotal - trafficUsed : 0
  const expireTimestamp = subscription?.expire ?? 0
  const expireDate =
    expireTimestamp > 0 ? dayjs.unix(expireTimestamp).format('L') : t('pages.home.never')
  const daysRemaining =
    expireTimestamp > 0 ? Math.max(0, dayjs.unix(expireTimestamp).diff(dayjs(), 'day')) : 0

  const firstGroup = groups?.[0]
  const currentProxy = useMemo(() => {
    const proxy = firstGroup?.all.find((item) => item.name === firstGroup.now)
    return proxy && !('all' in proxy) ? proxy : undefined
  }, [firstGroup])

  const [serverMenuOpen, setServerMenuOpen] = useState(false)
  const [connectionButtonHovered, setConnectionButtonHovered] = useState(false)
  const [switchingProxy, setSwitchingProxy] = useState<string | null>(null)
  const [pingTesting, setPingTesting] = useState(false)

  const handlePingAll = async (): Promise<void> => {
    if (!firstGroup || !firstGroup.now || pingTesting) return
    setPingTesting(true)
    try {
      await mihomoProxyDelay(firstGroup.now, firstGroup.testUrl)
      mutateGroups()
    } catch {
      // ignore node failure
    } finally {
      setPingTesting(false)
    }
  }

  const currentServerDelay = useMemo(() => {
    if (!firstGroup) return -1
    const current = firstGroup.all.find((proxy) => proxy.name === firstGroup.now)
    return current ? proxyDelay(current) : -1
  }, [firstGroup])

  // Keep handlePingAll fresh for the interval without restarting it on every render
  const pingAllRef = useRef(handlePingAll)
  pingAllRef.current = handlePingAll

  // Periodically refresh the current server's ping while connected and the window
  // is visible (paused when disconnected or minimized/hidden to avoid loading the
  // connection unnecessarily)
  const hasCurrentServer = Boolean(firstGroup?.now)
  useEffect(() => {
    if (!hasCurrentServer || !isSelected) return undefined
    let interval: ReturnType<typeof setInterval> | null = null

    const start = (): void => {
      if (interval) return
      interval = setInterval(() => {
        pingAllRef.current()
      }, 60000)
    }
    const stop = (): void => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [hasCurrentServer, isSelected])

  const handleChangeProxy = async (groupName: string, proxyName: string): Promise<void> => {
    if (switchingProxy) return
    setSwitchingProxy(proxyName)
    try {
      await mihomoChangeProxy(groupName, proxyName)
      if (autoCloseConnection) {
        await mihomoCloseAllConnections(groupName)
      }
      mutateGroups()
      setServerMenuOpen(false)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setSwitchingProxy(null)
    }
  }

  const supportUrl = currentProfile?.supportUrl
  const supportLinkInfo = useMemo(() => {
    if (!supportUrl) return null
    try {
      const parsed = new URL(supportUrl)
      const normalized = `${parsed.hostname}${parsed.pathname}`.toLowerCase()
      return {
        href: parsed.toString(),
        isTelegram:
          parsed.protocol === 'tg:' ||
          normalized.includes('t.me') ||
          normalized.includes('telegram')
      }
    } catch {
      return null
    }
  }, [supportUrl])

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    try {
      if (enable) {
        if (mainSwitchMode === 'tun') {
          await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
          await mihomoHotReloadConfig()
        } else {
          if (writeSysProxy && mode == 'manual' && sysProxyDisabled) return
          await patchAppConfig({ proxyMode: true })
          await mihomoHotReloadConfig()
          if (writeSysProxy) {
            await triggerSysProxy(true, onlyActiveDevice)
          }
        }
      } else {
        const tunWasEnabled = tun?.enable ?? false
        const proxyModeWasEnabled = proxyMode
        if (tunWasEnabled) {
          await patchControledMihomoConfig({ tun: { enable: false } })
        }
        if (proxyModeWasEnabled) {
          if (writeSysProxy) {
            await triggerSysProxy(false, onlyActiveDevice)
          }
          await patchAppConfig({ proxyMode: false })
        }
        if (tunWasEnabled || proxyModeWasEnabled) {
          await mihomoHotReloadConfig()
        }
      }
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
      await updateTrayIcon()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <BasePage>
      {!hasProfiles ? (
        <div className="h-full w-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-75 rounded-2xl border border-stroke bg-card/50 backdrop-blur-xl p-8">
            <WifiOff className="size-16 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">{t('pages.profiles.emptyTitle')}</h2>
            <p className="text-sm font-medium text-muted-foreground text-center">
              {t('pages.profiles.emptyDescription')}
            </p>
            <button
              onClick={handleAddProfile}
              data-guide="home-add-profile-btn"
              className="flex items-center gap-2 rounded-xl border border-stroke bg-gradient-start-power-on/50 backdrop-blur-xl px-6 py-3 text-foreground hover:bg-gradient-start-power-on/40 transition-colors"
            >
              <PlusCircle className="size-5" />
              <span className="text-sm font-medium">{t('pages.profiles.addProfile')}</span>
            </button>
          </div>
          {showEditModal && editingItem && (
            <EditInfoModal
              item={editingItem}
              isCurrent={false}
              updateProfileItem={async (item: ProfileItem) => {
                await addProfileItem(item)
                setShowEditModal(false)
                setEditingItem(null)
              }}
              onClose={() => {
                setShowEditModal(false)
                setEditingItem(null)
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full px-2 pb-2 gap-2 sm:gap-3">
          {/* Profile card */}
          {currentProfile && (
            <div className="w-full max-w-lg self-center rounded-2xl border border-stroke bg-card/45 p-2 backdrop-blur-xl sm:p-3">
              <div data-guide="home-profile-header" className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90 text-foreground dark:bg-white/10">
                    {currentProfile.logo ? (
                      <img
                        src={currentProfile.logo}
                        alt=""
                        className="size-full object-cover"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <FiUser className="size-4" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('pages.home.profile')}
                    </span>
                    <span
                      title={currentProfile.name}
                      className="truncate text-base font-medium leading-tight text-foreground"
                    >
                      {currentProfile.name}
                    </span>
                  </div>
                </div>
                {currentProfile.type === 'remote' && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={handleUpdateProfile}
                    disabled={updating}
                    aria-label={t('profile.updateSubscription')}
                    title={t('profile.updateSubscription')}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCcw className={updating ? 'animate-spin' : ''} />
                  </Button>
                )}
              </div>

              {currentProfile.announce && (
                <div
                  data-guide="home-profile-announce"
                  className="mt-2 min-w-0 whitespace-pre-line break-words text-left text-xs font-medium text-foreground"
                >
                  {currentProfile.announce}
                </div>
              )}

              {subscription && (
                <>
                  <Separator className="my-1 sm:my-2" />
                  <div className="grid min-w-0 grid-cols-1 divide-y divide-stroke sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 py-0.5 text-center sm:px-2">
                      <span className="text-xs text-muted-foreground">
                        {t('pages.home.trafficRemaining')}
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {trafficTotal > 0 ? (
                          formatBytes(Math.max(0, trafficRemaining))
                        ) : (
                          <InfinityIcon className="size-4" />
                        )}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 py-0.5 text-center sm:px-2">
                      <span className="text-xs text-muted-foreground">
                        {t('pages.home.daysRemaining')}
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {expireTimestamp > 0 ? daysRemaining : <InfinityIcon className="size-4" />}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 py-0.5 text-center sm:px-2">
                      <span className="text-xs text-muted-foreground">
                        {t('pages.home.expires')}
                      </span>
                      <span className="text-sm font-bold tabular-nums">{expireDate}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Connection button */}
          <div className="flex flex-col grow-3 items-center justify-center min-h-0 translate-y-1">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => void onValueChange(!isSelected)}
              data-guide="home-power-toggle"
              aria-label={status}
              aria-pressed={isSelected}
              aria-busy={loading}
              title={status}
              onMouseEnter={() => setConnectionButtonHovered(true)}
              onMouseLeave={() => setConnectionButtonHovered(false)}
              className={`group relative size-[clamp(260px,42vh,340px)] shrink-0 cursor-pointer rounded-full bg-transparent outline-none disabled:cursor-default disabled:opacity-60 disabled:hover:scale-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background ${
                isSelected
                  ? 'drop-shadow-[0_0_20px_rgba(50,255,50,0.24)]'
                  : 'opacity-80 grayscale-[0.18]'
              }`}
            >
              <HomeConnectionGlobe
                location={currentProxy?.location}
                connected={isSelected}
                hovered={connectionButtonHovered && !isDisabled}
                title={currentProfile?.announce ?? currentProfile?.name}
              />
              <span
                className={`pointer-events-none absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/70 shadow-lg backdrop-blur-md transition-all duration-200 ${
                  loading ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
                }`}
              >
                <Spinner className="size-9 text-foreground" />
              </span>
            </button>
            <div className="mt-3 h-8 flex items-center justify-center">
              <div
                aria-hidden={!showConnectedTimer}
                className={`timer inline-flex items-center gap-0.5 text-base font-bold text-foreground tabular-nums transition-all duration-300 ease-out ${
                  showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                }`}
              >
                <NumberFlow
                  value={elapsedHours}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
                <span>:</span>
                <NumberFlow
                  value={elapsedMinutes}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
                <span>:</span>
                <NumberFlow
                  value={elapsedSeconds}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
              </div>
            </div>
            <div
              aria-hidden={!showConnectedTimer}
              className={`mt-2 flex items-center gap-4 tabular-nums transition-all duration-300 ease-out ${
                showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowUp className="size-3.5 text-stroke-power-on" />
                <span>{calcTraffic(trafficInfo.upTotal)}</span>
              </div>
              <div className="h-3 w-px bg-stroke" />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowDown className="size-3.5 text-stroke-power-on" />
                <span>{calcTraffic(trafficInfo.downTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 -translate-y-9">
            {/* Server selector */}
            {firstGroup && (
              <div className="mx-auto w-full max-w-[304px]">
                <Popover open={serverMenuOpen} onOpenChange={setServerMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      data-guide="home-group-selector"
                      className="group w-full min-w-0 cursor-pointer outline-hidden"
                    >
                      <div className="flex h-15 items-center gap-2 rounded-xl border border-stroke bg-card/45 px-3 backdrop-blur-xl transition-all hover:border-stroke-power-on/40 hover:bg-card/75">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-stroke bg-gradient-start-power-on/10 text-stroke-power-on">
                          <Globe className="size-4.5" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col text-left">
                          <span className="text-xs leading-tight text-muted-foreground">
                            {t('pages.home.server')}
                          </span>
                          <span
                            className="flag-emoji mt-0.5 truncate text-sm font-medium leading-tight"
                            title={firstGroup.now || firstGroup.name}
                          >
                            {firstGroup.now || firstGroup.name}
                          </span>
                        </div>
                        <span className="flex shrink-0 items-center justify-center">
                          {pingTesting ? (
                            <Spinner className="size-4" />
                          ) : currentServerDelay > 0 ? (
                            <span
                              role="button"
                              tabIndex={0}
                              title={t('pages.home.pingTest')}
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePingAll()
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handlePingAll()
                                }
                              }}
                              className="flex items-center justify-center rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                            >
                              <span
                                className={`text-xs font-medium tabular-nums ${delayColorClass(currentServerDelay)}`}
                              >
                                {currentServerDelay} ms
                              </span>
                            </span>
                          ) : (
                            <span
                              role="button"
                              tabIndex={0}
                              title={t('pages.home.pingTest')}
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePingAll()
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handlePingAll()
                                }
                              }}
                              className="flex items-center justify-center rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                            >
                              <Gauge className="size-4" />
                            </span>
                          )}
                        </span>
                        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="center"
                    sideOffset={6}
                    className="w-(--radix-popover-trigger-width) max-w-[304px] p-1.5"
                  >
                    <div className="flag-emoji flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                      {firstGroup.all.map((proxy) => {
                        const delay = proxyDelay(proxy)
                        const selected = proxy.name === firstGroup.now
                        return (
                          <button
                            key={proxy.name}
                            disabled={switchingProxy !== null}
                            onClick={() => handleChangeProxy(firstGroup.name, proxy.name)}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:cursor-default ${
                              selected ? 'bg-primary/10' : 'hover:bg-accent/60'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Check
                                className={`size-4 shrink-0 text-primary ${selected ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <span className="text-sm truncate" title={proxy.name}>
                                {proxy.name}
                              </span>
                            </div>
                            <span className="shrink-0 inline-flex items-center justify-center w-10">
                              {switchingProxy === proxy.name ? (
                                <Spinner className="size-3.5" />
                              ) : (
                                <span
                                  className={`text-xs font-medium tabular-nums ${delayColorClass(delay)}`}
                                >
                                  {delay <= 0 ? '—' : delay}
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {supportLinkInfo && (
              <div className="flex justify-center text-sm text-muted-foreground">
                <button
                  data-guide="home-support-link"
                  type="button"
                  onClick={() => open(supportLinkInfo.href)}
                  className="inline-flex translate-y-1 items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                >
                  {supportLinkInfo.isTelegram ? (
                    <SiTelegram className="size-4" />
                  ) : (
                    <Globe className="size-4" />
                  )}
                  <span>{t('pages.profiles.support')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </BasePage>
  )
}

export default Home
