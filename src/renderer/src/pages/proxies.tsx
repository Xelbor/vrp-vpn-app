import { Avatar, AvatarImage } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Spinner } from '@renderer/components/ui/spinner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import ProxyGlobe, {
  buildProxyGlobeCountries,
  ProxyGlobeCountry,
  ProxyGlobeFocusRequest
} from '@renderer/components/proxies/proxy-globe'
import {
  getImageDataURL,
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoProxyDelay
} from '@renderer/utils/ipc'
import { forwardRef, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { ListProps, Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import ProxyItem from '@renderer/components/proxies/proxy-item'
import ProxySettingModal from '@renderer/components/proxies/proxy-setting-modal'
import { useGroups } from '@renderer/hooks/use-groups'
import CollapseInput from '@renderer/components/base/collapse-input'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { cn } from '@renderer/lib/utils'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useTranslation } from 'react-i18next'
import {
  ChevronsDownUp,
  ChevronsRight,
  ChevronsUpDown,
  Gauge,
  MousePointerClick,
  LocateFixed,
  RefreshCcw,
  Route,
  Scale,
  Shield,
  SlidersHorizontal,
  Zap
} from 'lucide-react'

const groupTypeColor: Record<string, string> = {
  Selector: 'border-blue-500/40 bg-blue-500/8 text-blue-600 dark:text-blue-400 dark:border-blue-400/40',
  URLTest:
    'border-emerald-500/40 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400/40',
  Fallback:
    'border-amber-500/40 bg-amber-500/8 text-amber-600 dark:text-amber-400 dark:border-amber-400/40',
  LoadBalance:
    'border-violet-500/40 bg-violet-500/8 text-violet-600 dark:text-violet-400 dark:border-violet-400/40',
  Relay: 'border-rose-500/40 bg-rose-500/8 text-rose-600 dark:text-rose-400 dark:border-rose-400/40'
}

const groupTypeIcon: Record<string, React.ReactNode> = {
  Selector: <MousePointerClick className="size-4" />,
  URLTest: <Zap className="size-4" />,
  Fallback: <Shield className="size-4" />,
  LoadBalance: <Scale className="size-4" />,
  Relay: <Route className="size-4" />
}

type ProxyListItem =
  | { kind: 'group'; groupIndex: number }
  | { kind: 'row'; groupIndex: number; rowIndex: number }

interface ProxyListContext {
  countries: ProxyGlobeCountry[]
  locale: string
  focusRequest: ProxyGlobeFocusRequest | null
}

const ProxyListHeader: React.FC<{ context: ProxyListContext }> = ({ context }) => (
  <div className="h-[clamp(20rem,56vh,32rem)] min-h-0">
    <ProxyGlobe
      countries={context.countries}
      locale={context.locale}
      focusRequest={context.focusRequest}
    />
  </div>
)

const ProxySelectorList = forwardRef<
  HTMLDivElement,
  ListProps & { context: ProxyListContext }
>(({ context: _context, ...props }, ref) => (
  <div {...props} ref={ref} className="mx-auto w-[94%]" />
))

ProxySelectorList.displayName = 'ProxySelectorList'

const proxyListComponents = {
  Header: ProxyListHeader,
  List: ProxySelectorList
}

const Proxies: React.FC = () => {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const fromHome = (location.state as { fromHome?: boolean })?.fromHome ?? false
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { mode = 'rule' } = controledMihomoConfig || {}
  const { groups = [], mutate } = useGroups()
  const { profileConfig, addProfileItem } = useProfileConfig()
  const { appConfig } = useAppConfig()
  const {
    proxyDisplayLayout = 'double',
    groupDisplayLayout = 'double',
    proxyDisplayOrder = 'default',
    autoCloseConnection = true,
    proxyCols = 'auto',
    delayTestConcurrency = 50,
    expandProxyGroups = false
  } = appConfig || {}
  const [cols, setCols] = useState(1)
  const [isOpen, setIsOpen] = useState<boolean[]>([])
  const [delaying, setDelaying] = useState<boolean[]>([])
  const [searchValue, setSearchValue] = useState<string[]>([])
  const [iconLoadTick, setIconLoadTick] = useState(0)
  const delayingProxiesRef = useRef<Set<string>>(new Set())
  const completedProxiesRef = useRef<Set<string>>(new Set())
  const [delayingTick, setDelayingTick] = useState(0)
  const prevGroupsLengthRef = useRef(0)
  const [isSettingModalOpen, setIsSettingModalOpen] = useState(false)
  const [updatingSubscription, setUpdatingSubscription] = useState(false)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const pendingScrollRef = useRef<{ groupIndex: number; proxyName: string } | null>(null)
  const recentlyOpenedRef = useRef<Set<number>>(new Set())
  const globeFocusIdRef = useRef(0)
  const [globeFocusRequest, setGlobeFocusRequest] =
    useState<ProxyGlobeFocusRequest | null>(null)
  const { countries } = useMemo(
    () => buildProxyGlobeCountries(groups || []),
    [groups]
  )
  useEffect(() => {
    if (groups.length !== prevGroupsLengthRef.current) {
      prevGroupsLengthRef.current = groups.length
      setIsOpen((prev) => {
        if (prev.length === groups.length && prev.every(Boolean)) return prev
        return Array(groups.length).fill(true)
      })
      setDelaying((prev) => {
        if (prev.length === groups.length) return prev
        const next = Array(groups.length).fill(false)
        prev.forEach((v, i) => { if (i < next.length) next[i] = v })
        return next
      })
      setSearchValue((prev) => {
        if (prev.length === groups.length) return prev
        const next = Array(groups.length).fill('')
        prev.forEach((v, i) => { if (i < next.length) next[i] = v })
        return next
      })
    }
  }, [groups.length, expandProxyGroups])

  // Re-apply to every group when the setting itself flips (e.g. a subscription sent the
  // `expand-proxy-groups` header while this page is already open).
  

  useEffect(() => {
    groups.forEach((group) => {
      if (group.icon && group.icon.startsWith('http') && !localStorage.getItem(group.icon)) {
        getImageDataURL(group.icon).then((dataURL) => {
          localStorage.setItem(group.icon, dataURL)
          setIconLoadTick((c) => c + 1)
        })
      }
    })
    if (completedProxiesRef.current.size > 0) {
      const completed = completedProxiesRef.current
      completedProxiesRef.current = new Set()
      completed.forEach((name) => delayingProxiesRef.current.delete(name))
      setDelayingTick((c) => c + 1)
    }
  }, [groups])

  const { groupCounts, allProxies } = useMemo(() => {
    const groupCounts: number[] = []
    const allProxies: (ControllerProxiesDetail | ControllerGroupDetail)[][] = []
    groups.forEach((group, index) => {
      if (isOpen[index]) {
        let groupProxies = group.all.filter(
          (proxy) => proxy && includesIgnoreCase(proxy.name, searchValue[index])
        )
        const count = Math.floor(groupProxies.length / cols)
        groupCounts.push(groupProxies.length % cols === 0 ? count : count + 1)
        if (proxyDisplayOrder === 'delay') {
          groupProxies = groupProxies.sort((a, b) => {
            if (a.history.length === 0) return -1
            if (b.history.length === 0) return 1
            if (a.history[a.history.length - 1].delay === 0) return 1
            if (b.history[b.history.length - 1].delay === 0) return -1
            return a.history[a.history.length - 1].delay - b.history[b.history.length - 1].delay
          })
        }
        if (proxyDisplayOrder === 'name') {
          groupProxies = groupProxies.sort((a, b) => a.name.localeCompare(b.name))
        }
        allProxies.push(groupProxies)
      } else {
        groupCounts.push(0)
        allProxies.push([])
      }
    })
    return { groupCounts, allProxies }
  }, [groups, isOpen, proxyDisplayOrder, cols, searchValue])

  const proxyListItems = useMemo<ProxyListItem[]>(() => {
    return groups.flatMap((_, groupIndex) => [
      { kind: 'group' as const, groupIndex },
      ...Array.from({ length: groupCounts[groupIndex] }, (_, rowIndex) => ({
        kind: 'row' as const,
        groupIndex,
        rowIndex
      }))
    ])
  }, [groups, groupCounts])

  const getProxyRowListIndex = useCallback(
    (groupIndex: number, rowIndex: number): number => {
      let listIndex = 0
      for (let index = 0; index < groupIndex; index++) {
        listIndex += groupCounts[index] + 1
      }
      return listIndex + rowIndex + 1
    },
    [groupCounts]
  )

  const allExpanded = useMemo(() => {
    return groups.length > 0 && isOpen.every(Boolean)
  }, [groups, isOpen])

  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const updateSubscription = useCallback(async (): Promise<void> => {
    if (!currentProfile || currentProfile.type !== 'remote' || updatingSubscription) return

    setUpdatingSubscription(true)
    try {
      await addProfileItem(currentProfile)
    } finally {
      setUpdatingSubscription(false)
    }
  }, [currentProfile, updatingSubscription, addProfileItem])

  const onChangeProxy = useCallback(
    async (group: string, proxy: string): Promise<void> => {
      const countryCode = countries.find((country) =>
        country.nodes.some(
          (node) => node.groupName === group && node.proxy.name === proxy
        )
      )?.countryCode

      await mihomoChangeProxy(group, proxy)
      if (countryCode) {
        globeFocusIdRef.current += 1
        setGlobeFocusRequest({ countryCode, id: globeFocusIdRef.current })
      }
      if (autoCloseConnection) {
        await mihomoCloseAllConnections(group)
      }
      mutate()
    },
    [autoCloseConnection, countries, mutate]
  )

  const onProxyDelay = useCallback(
    async (
      proxy: ControllerProxiesDetail | ControllerGroupDetail,
      url?: string
    ): Promise<ControllerProxiesDelay> => {
      return await mihomoProxyDelay(proxy.name, url)
    },
    []
  )

  const mutateThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const throttledMutate = useCallback(() => {
    if (mutateThrottleRef.current) return
    mutateThrottleRef.current = setTimeout(() => {
      mutate()
      mutateThrottleRef.current = null
    }, 500)
  }, [mutate])
  useEffect(() => {
    return () => {
      if (mutateThrottleRef.current) clearTimeout(mutateThrottleRef.current)
    }
  }, [])

  const onGroupDelay = useCallback(
    async (index: number): Promise<void> => {
      if (allProxies[index].length === 0) {
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
      }
      setDelaying((prev) => {
        const newDelaying = [...prev]
        newDelaying[index] = true
        return newDelaying
      })
      allProxies[index].forEach((p) => delayingProxiesRef.current.add(p.name))
      setDelayingTick((c) => c + 1)
      const result: Promise<void>[] = []
      const runningList: Promise<void>[] = []
      for (const proxy of allProxies[index]) {
        const promise = Promise.resolve().then(async () => {
          try {
            await mihomoProxyDelay(proxy.name, groups[index].testUrl)
          } catch {
            // ignore
          } finally {
            completedProxiesRef.current.add(proxy.name)
            throttledMutate()
          }
        })
        result.push(promise)
        const running = promise.then(() => {
          runningList.splice(runningList.indexOf(running), 1)
        })
        runningList.push(running)
        if (runningList.length >= (delayTestConcurrency || 50)) {
          await Promise.race(runningList)
        }
      }
      await Promise.all(result)
      mutate()
      setDelaying((prev) => {
        const newDelaying = [...prev]
        newDelaying[index] = false
        return newDelaying
      })
    },
    [allProxies, groups, delayTestConcurrency, mutate, throttledMutate]
  )

  const proxyListContext = useMemo<ProxyListContext>(
    () => ({
      countries: countries as ProxyGlobeCountry[],
      locale: i18n.language,
      focusRequest: globeFocusRequest
    }),
    [countries, i18n.language, globeFocusRequest]
  )

  const calcCols = useCallback((): number => {
    if (window.matchMedia('(min-width: 1536px)').matches) {
      return 5
    } else if (window.matchMedia('(min-width: 1280px)').matches) {
      return 4
    } else if (window.matchMedia('(min-width: 1024px)').matches) {
      return 3
    } else {
      return 2
    }
  }, [])

  const toggleOpen = useCallback((index: number) => {
    setIsOpen((prev) => {
      const newOpen = [...prev]
      newOpen[index] = !prev[index]
      if (!prev[index]) {
        recentlyOpenedRef.current.add(index)
        setTimeout(() => recentlyOpenedRef.current.delete(index), 1000)
      }
      return newOpen
    })
  }, [])

  const toggleAll = useCallback(() => {
    setIsOpen((prev) => {
      const shouldExpand = !prev.every(Boolean)
      if (shouldExpand) {
        prev.forEach((v, i) => {
          if (!v) recentlyOpenedRef.current.add(i)
        })
        setTimeout(() => recentlyOpenedRef.current.clear(), 1000)
      }
      return Array(prev.length).fill(shouldExpand)
    })
  }, [])

  const updateSearchValue = useCallback((index: number, value: string) => {
    setSearchValue((prev) => {
      const newSearchValue = [...prev]
      newSearchValue[index] = value
      return newSearchValue
    })
  }, [])

  const scrollToCurrentProxy = useCallback(
    (groupIndex: number) => {
      const group = groups[groupIndex]
      if (!group) return

      if (!isOpen[groupIndex]) {
        pendingScrollRef.current = { groupIndex, proxyName: group.now }
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[groupIndex] = true
          return newOpen
        })
        return
      }

      const proxyIndex = allProxies[groupIndex]?.findIndex((proxy) => proxy.name === group.now) ?? -1
      if (proxyIndex < 0) return

      virtuosoRef.current?.scrollToIndex({
        index: getProxyRowListIndex(groupIndex, Math.floor(proxyIndex / cols)),
        align: 'start'
      })
    },
    [groups, isOpen, allProxies, getProxyRowListIndex, cols]
  )

  useEffect(() => {
    const pendingScroll = pendingScrollRef.current
    if (!pendingScroll || !isOpen[pendingScroll.groupIndex]) return

    const proxyIndex =
      allProxies[pendingScroll.groupIndex]?.findIndex(
        (proxy) => proxy.name === pendingScroll.proxyName
      ) ?? -1
    pendingScrollRef.current = null
    if (proxyIndex < 0) return

    const frame = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: getProxyRowListIndex(
          pendingScroll.groupIndex,
          Math.floor(proxyIndex / cols)
        ),
        align: 'start'
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, allProxies, getProxyRowListIndex, cols, proxyListItems])

  useEffect(() => {
    if (proxyCols !== 'auto') {
      setCols(parseInt(proxyCols))
      return
    }
    setCols(calcCols())
    const handleResize = (): void => {
      setCols(calcCols())
    }
    window.addEventListener('resize', handleResize)
    return (): void => {
      window.removeEventListener('resize', handleResize)
    }
  }, [proxyCols, calcCols])

  const groupContent = useCallback(
    (index: number) => {
      const group = groups[index]
      if (!group) return <div>Never See This</div>

      const typeColorClass =
        groupTypeColor[group.type] || 'border-muted bg-muted text-muted-foreground'
      const isExpanded = groupCounts[index] > 0
      const showMeta = groupDisplayLayout !== 'hidden'

      return (
        <div className="w-full px-2 pb-2">
          <Card
            data-guide={index === 0 ? 'proxies-first-group' : undefined}
            data-guide-open={index === 0 ? `${isOpen[index]}` : undefined}
            className={cn('w-full relative isolate bg-card/50 backdrop-blur-3xl cursor-pointer py-0 transition-all duration-200', isExpanded ? 'z-10 shadow-md' : 'hover:shadow-sm')}
            role="button"
            tabIndex={0}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
              }
            }}
          >
            <CardContent className="w-full px-4 py-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {group.icon ? (
                    <Avatar className="bg-transparent rounded-md shrink-0 size-9">
                      <AvatarImage
                        src={
                          group.icon.startsWith('<svg')
                            ? `data:image/svg+xml;utf8,${group.icon}`
                            : localStorage.getItem(group.icon) || group.icon
                        }
                      />
                    </Avatar>
                  ) : (
                    <div className={cn('flex items-center justify-center shrink-0 size-9 rounded-md', typeColorClass)}>
                      {groupTypeIcon[group.type] || <Zap className="size-4" />}
                    </div>
                  )}
                  <div className={`flex ${groupDisplayLayout === 'double' ? 'flex-col gap-0.5' : 'items-center gap-2'} min-w-0`}>
                    <div className="flex items-center gap-2">
                      <span className="flag-emoji text-sm font-semibold truncate leading-tight">
                        {group.name}
                      </span>
                      {showMeta && (
                        <Badge
                          variant="ghost"
                          className={cn('text-[10px] px-1.5 py-0 h-4 rounded font-semibold uppercase tracking-wider shrink-0', typeColorClass)}
                        >
                          {group.type}
                        </Badge>
                      )}
                    </div>
                    {showMeta && (
                      <span className="flag-emoji text-xs text-muted-foreground truncate leading-tight">
                        {group.now}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <CollapseInput
                      value={searchValue[index]}
                      onValueChange={(v) => updateSearchValue(index, v)}
                    />
                    <Button
                      title={t('sider.locateCurrentNode')}
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => scrollToCurrentProxy(index)}
                    >
                      <LocateFixed className="text-base" />
                    </Button>
                    <Button
                      title={t('sider.delayTest')}
                      variant="ghost"
                      size="icon-sm"
                      disabled={delaying[index]}
                      aria-busy={delaying[index]}
                      onClick={() => onGroupDelay(index)}
                    >
                      {delaying[index] ? (
                        <Spinner className="size-4" />
                      ) : (
                        <Gauge className="text-base" />
                      )}
                    </Button>
                    {currentProfile?.type === 'remote' && (
                      <Button
                        title={t('profile.updateSubscription')}
                        aria-label={t('profile.updateSubscription')}
                        variant="ghost"
                        size="icon-sm"
                        disabled={updatingSubscription}
                        aria-busy={updatingSubscription}
                        onClick={() => void updateSubscription()}
                      >
                        <RefreshCcw
                          className={cn('text-base', updatingSubscription && 'animate-spin')}
                        />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    },
    [
      groups,
      groupCounts,
      isOpen,
      groupDisplayLayout,
      searchValue,
      delaying,
      iconLoadTick,
      toggleOpen,
      updateSearchValue,
      scrollToCurrentProxy,
      onGroupDelay,
      currentProfile,
      updatingSubscription,
      updateSubscription,
      t
    ]
  )

  const itemContent = useCallback(
    (_index: number, item: ProxyListItem) => {
      if (item.kind === 'group') return groupContent(item.groupIndex)

      const { groupIndex, rowIndex } = item
      const group = groups[groupIndex]
      const groupProxies = allProxies[groupIndex]
      if (!group || !groupProxies) return <div>Never See This</div>

      const isLastRow = rowIndex === groupCounts[groupIndex] - 1
      const shouldAnimate = recentlyOpenedRef.current.has(groupIndex)
      return (
        <div className="flow-root">
          <div
            className={cn('mx-2 bg-card/50 backdrop-blur-xl border-x border-border/50', rowIndex === 0 && '-mt-5 pt-3', isLastRow && 'rounded-b-xl border-b shadow-sm mb-2', shouldAnimate && 'animate-proxy-row-enter')}
            style={shouldAnimate ? { animationDelay: `${Math.min(rowIndex * 0.04, 0.3)}s` } : undefined}
          >
            <div
              data-guide={groupIndex === 0 ? 'proxies-first-group-row' : undefined}
              style={
                proxyCols !== 'auto'
                  ? { gridTemplateColumns: `repeat(${proxyCols}, minmax(0, 1fr))` }
                  : {}
              }
              className={cn(
                'grid grid-cols-1 gap-2 px-3 pt-2',
                isLastRow && 'pb-3'
              )}
            >
              {Array.from({ length: cols }).map((_, columnIndex) => {
                const proxy = groupProxies[rowIndex * cols + columnIndex]
                if (!proxy) return null
                return (
                  <ProxyItem
                    key={proxy.name}
                    mutateProxies={mutate}
                    onProxyDelay={onProxyDelay}
                    onSelect={onChangeProxy}
                    proxy={proxy}
                    group={group}
                    proxyDisplayLayout={proxyDisplayLayout}
                    selected={proxy.name === group.now}
                    isGroupDelaying={delayingProxiesRef.current.has(proxy.name)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )
    },
    [
      groupContent,
      groups,
      allProxies,
      groupCounts,
      proxyCols,
      cols,
      mutate,
      onProxyDelay,
      onChangeProxy,
      proxyDisplayLayout,
      delayingTick
    ]
  )

  return (
    <BasePage
      title={t('pages.proxies.title')}
      showBackButton={fromHome}
      contentClassName="overflow-hidden"
      header={
        <>
          <Button
            size="icon-sm"
            variant="ghost"
            className="app-nodrag"
            title={allExpanded ? t('pages.proxies.collapseAll') : t('pages.proxies.expandAll')}
            onClick={toggleAll}
          >
            {allExpanded ? (
              <ChevronsDownUp className="text-lg" />
            ) : (
              <ChevronsUpDown className="text-lg" />
            )}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="app-nodrag"
            title={t('pages.proxies.proxyGroupSettings')}
            onClick={() => setIsSettingModalOpen(true)}
          >
            <SlidersHorizontal className="text-lg" />
          </Button>
        </>
      }
    >
      {isSettingModalOpen && <ProxySettingModal onClose={() => setIsSettingModalOpen(false)} />}
      {mode === 'direct' ? (
        <div className="h-full w-full flex justify-center items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-muted p-6">
              <ChevronsRight className="text-muted-foreground text-5xl" />
            </div>
            <h2 className="text-muted-foreground text-lg font-medium">{t('sider.directMode')}</h2>
          </div>
        </div>
      ) : (
        <div className="h-full min-h-0">
          <Virtuoso<ProxyListItem, ProxyListContext>
            ref={virtuosoRef}
            data={proxyListItems}
            context={proxyListContext}
            components={proxyListComponents}
            defaultItemHeight={72}
            increaseViewportBy={{ top: 0, bottom: 96 }}
            computeItemKey={(_index, item) =>
              item.kind === 'group'
                ? `group-${item.groupIndex}`
                : `row-${item.groupIndex}-${item.rowIndex}`
            }
            itemContent={itemContent}
          />
        </div>
      )}
    </BasePage>
  )
}

export default Proxies