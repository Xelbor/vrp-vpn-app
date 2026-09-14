import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Gauge, LocateFixed, RefreshCcw, Zap } from 'lucide-react'
import { Avatar, AvatarImage } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Spinner } from '@renderer/components/ui/spinner'
import CollapseInput from '@renderer/components/base/collapse-input'
import {
  getProviderName,
  groupTypeColor,
  groupTypeIcon
} from '@renderer/components/proxies/group-meta'
import ProxyItem from '@renderer/components/proxies/proxy-item'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { cn } from '@renderer/lib/utils'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { getImageDataURL, mihomoProxyDelay } from '@renderer/utils/ipc'

interface HomeGroupCardProps {
  group: ControllerMixedGroup
  mutateGroups: () => void
  onChangeProxy: (groupName: string, proxyName: string) => Promise<void>
  updatingSubscription?: boolean
  onUpdateSubscription?: () => void
}

export default function HomeGroupCard({
  group,
  mutateGroups,
  onChangeProxy,
  updatingSubscription = false,
  onUpdateSubscription
}: HomeGroupCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { appConfig } = useAppConfig()
  const {
    proxyDisplayLayout = 'double',
    groupDisplayLayout = 'double',
    proxyDisplayOrder = 'default',
    delayTestConcurrency = 50
  } = appConfig || {}

  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [delaying, setDelaying] = useState(false)
  const [delayingProxies, setDelayingProxies] = useState<Set<string>>(new Set())
  const completedProxiesRef = useRef<Set<string>>(new Set())
  const currentItemRef = useRef<HTMLDivElement>(null)

  const icon = group.icon
  const [iconDataURL, setIconDataURL] = useState(() =>
    icon ? localStorage.getItem(icon) : null
  )
  useEffect(() => {
    if (!icon || !icon.startsWith('http')) return
    const cached = localStorage.getItem(icon)
    if (cached) {
      setIconDataURL(cached)
      return
    }
    getImageDataURL(icon).then((dataURL) => {
      localStorage.setItem(icon, dataURL)
      setIconDataURL(dataURL)
    })
  }, [icon])

  // Clear the pending delay markers once refreshed group data carries the new values.
  useEffect(() => {
    if (completedProxiesRef.current.size === 0) return
    const completed = completedProxiesRef.current
    completedProxiesRef.current = new Set()
    setDelayingProxies((prev) => {
      const next = new Set(prev)
      completed.forEach((name) => next.delete(name))
      return next
    })
  }, [group])

  const proxies = useMemo(() => {
    const filtered = group.all.filter(
      (proxy) => proxy && includesIgnoreCase(proxy.name, searchValue)
    )
    if (proxyDisplayOrder === 'delay') {
      return [...filtered].sort((a, b) => {
        if (a.history.length === 0) return -1
        if (b.history.length === 0) return 1
        if (a.history[a.history.length - 1].delay === 0) return 1
        if (b.history[b.history.length - 1].delay === 0) return -1
        return a.history[a.history.length - 1].delay - b.history[b.history.length - 1].delay
      })
    }
    if (proxyDisplayOrder === 'name') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    }
    return filtered
  }, [group.all, proxyDisplayOrder, searchValue])

  const mutateThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const throttledMutate = useCallback(() => {
    if (mutateThrottleRef.current) return
    mutateThrottleRef.current = setTimeout(() => {
      mutateGroups()
      mutateThrottleRef.current = null
    }, 500)
  }, [mutateGroups])
  useEffect(() => {
    return () => {
      if (mutateThrottleRef.current) clearTimeout(mutateThrottleRef.current)
    }
  }, [])

  const onGroupDelay = useCallback(async (): Promise<void> => {
    if (delaying) return
    setDelaying(true)
    setDelayingProxies(new Set(proxies.map((proxy) => proxy.name)))

    const all: Promise<void>[] = []
    const running: Promise<void>[] = []
    for (const proxy of proxies) {
      const promise = Promise.resolve().then(async () => {
        try {
          await mihomoProxyDelay(proxy.name, group.testUrl, getProviderName(proxy))
        } catch {
          // ignore node failure
        } finally {
          completedProxiesRef.current.add(proxy.name)
          throttledMutate()
        }
      })
      all.push(promise)
      const tracked = promise.then(() => {
        running.splice(running.indexOf(tracked), 1)
      })
      running.push(tracked)
      if (running.length >= (delayTestConcurrency || 50)) {
        await Promise.race(running)
      }
    }
    await Promise.all(all)
    mutateGroups()
    setDelaying(false)
  }, [delaying, proxies, group.testUrl, delayTestConcurrency, mutateGroups, throttledMutate])

  const onProxyDelay = useCallback(
    async (
      proxy: ControllerProxiesDetail | ControllerGroupDetail,
      url?: string
    ): Promise<ControllerProxiesDelay> => {
      return await mihomoProxyDelay(proxy.name, url, getProviderName(proxy))
    },
    []
  )

  const onSelect = useCallback(
    async (groupName: string, proxyName: string): Promise<void> => {
      try {
        await onChangeProxy(groupName, proxyName)
        setOpen(false)
      } catch (e) {
        toast.error(`${e}`)
      }
    },
    [onChangeProxy]
  )

  const scrollToCurrentProxy = useCallback((): void => {
    currentItemRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  // Bring the active node into view whenever the list opens.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(scrollToCurrentProxy)
    return () => cancelAnimationFrame(frame)
  }, [open, scrollToCurrentProxy])

  const typeColorClass =
    groupTypeColor[group.type] || 'border-muted bg-muted text-muted-foreground'
  const showMeta = groupDisplayLayout !== 'hidden'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Card
          data-guide="home-group-selector"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen((value) => !value)
            }
          }}
          className={cn(
            'w-full cursor-pointer bg-card/45 py-0 backdrop-blur-xl transition-all duration-200 outline-hidden hover:border-stroke-power-on/40 hover:bg-card/75 focus-visible:ring-2 focus-visible:ring-ring',
            open && 'border-stroke-power-on/40 bg-card/75'
          )}
        >
          <CardContent className="w-full px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {group.icon ? (
                  <Avatar className="size-9 shrink-0 rounded-md bg-transparent">
                    <AvatarImage
                      src={
                        group.icon.startsWith('<svg')
                          ? `data:image/svg+xml;utf8,${group.icon}`
                          : iconDataURL || group.icon
                      }
                    />
                  </Avatar>
                ) : (
                  <div
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-md',
                      typeColorClass
                    )}
                  >
                    {groupTypeIcon[group.type] || <Zap className="size-4" />}
                  </div>
                )}
                <div
                  className={cn(
                    'min-w-0',
                    groupDisplayLayout === 'double'
                      ? 'flex flex-col gap-0.5'
                      : 'flex items-center gap-2'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flag-emoji truncate text-sm font-semibold leading-tight">
                      {group.name}
                    </span>
                    {showMeta && (
                      <Badge
                        variant="ghost"
                        className={cn(
                          'h-4 shrink-0 rounded px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider',
                          typeColorClass
                        )}
                      >
                        {group.type}
                      </Badge>
                    )}
                  </div>
                  {showMeta && (
                    <span
                      className="flag-emoji truncate text-xs leading-tight text-muted-foreground"
                      title={group.now}
                    >
                      {group.now}
                    </span>
                  )}
                </div>
              </div>

              <div
                className="flex shrink-0 items-center gap-0.5"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <div className="flex w-auto items-center [&>[data-slot=input-group]]:w-28">
                  <CollapseInput value={searchValue} onValueChange={setSearchValue} />
                </div>
                <Button
                  title={t('sider.locateCurrentNode')}
                  variant="ghost"
                  size="icon-sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpen(true)
                    scrollToCurrentProxy()
                  }}
                >
                  <LocateFixed className="text-base" />
                </Button>
                <Button
                  title={t('sider.delayTest')}
                  variant="ghost"
                  size="icon-sm"
                  disabled={delaying}
                  aria-busy={delaying}
                  onClick={(event) => {
                    event.stopPropagation()
                    void onGroupDelay()
                  }}
                >
                  {delaying ? <Spinner className="size-4" /> : <Gauge className="text-base" />}
                </Button>
                {onUpdateSubscription && (
                  <Button
                    title={t('profile.updateSubscription')}
                    aria-label={t('profile.updateSubscription')}
                    variant="ghost"
                    size="icon-sm"
                    disabled={updatingSubscription}
                    aria-busy={updatingSubscription}
                    onClick={(event) => {
                      event.stopPropagation()
                      onUpdateSubscription()
                    }}
                  >
                    <RefreshCcw
                      className={cn('text-base', updatingSubscription && 'animate-spin')}
                    />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        className="w-(--radix-popover-trigger-width) p-1.5"
      >
        <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden p-0.5 sm:grid-cols-2">
          {proxies.length === 0 ? (
            <span className="px-2 py-3 text-center text-xs text-muted-foreground sm:col-span-2">
              {t('pages.home.noServersFound')}
            </span>
          ) : (
            proxies.map((proxy) => {
              const selected = proxy.name === group.now
              return (
                <div key={proxy.name} ref={selected ? currentItemRef : undefined}>
                  <ProxyItem
                    mutateProxies={mutateGroups}
                    onProxyDelay={onProxyDelay}
                    onSelect={(groupName, proxyName) => void onSelect(groupName, proxyName)}
                    proxy={proxy}
                    group={group}
                    proxyDisplayLayout={proxyDisplayLayout}
                    selected={selected}
                    isGroupDelaying={delayingProxies.has(proxy.name)}
                  />
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
