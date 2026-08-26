import BasePage from '@renderer/components/base/base-page'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { mihomoChangeProxy, mihomoCloseAllConnections } from '@renderer/utils/ipc'
import ProxyGlobe, {
  buildProxyGlobeCountries,
  ProxyGlobeCountry
} from '@renderer/components/proxies/proxy-globe'
import { AlertCircle, ChevronsRight, Globe2, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const Proxies: React.FC = () => {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const fromHome = (location.state as { fromHome?: boolean })?.fromHome ?? false
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { mode = 'rule' } = controledMihomoConfig || {}
  const { groups, error, isLoading, mutate } = useGroups()
  const { appConfig } = useAppConfig()
  const autoCloseConnection = appConfig?.autoCloseConnection ?? true
  const [switchingProxy, setSwitchingProxy] = useState<string | null>(null)

  const { countries, unresolvedNodes } = useMemo(
    () => buildProxyGlobeCountries(groups || []),
    [groups]
  )

  const onSelect = useCallback(
    async (groupName: string, proxyName: string): Promise<void> => {
      const operationKey = `${groupName}:${proxyName}`
      setSwitchingProxy(operationKey)
      try {
        await mihomoChangeProxy(groupName, proxyName)
        if (autoCloseConnection) await mihomoCloseAllConnections(groupName)
        await mutate()
      } catch (e) {
        toast.error(t('pages.proxies.switchFailed'), { description: `${e}` })
      } finally {
        setSwitchingProxy(null)
      }
    },
    [autoCloseConnection, mutate, t]
  )

  const renderState = (): React.ReactNode => {
    if (mode === 'direct') {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-muted p-6">
              <ChevronsRight className="text-5xl text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium text-muted-foreground">{t('sider.directMode')}</h2>
          </div>
        </div>
      )
    }

    if (isLoading && !groups) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <Spinner className="size-7" />
          <span>{t('pages.proxies.loading')}</span>
        </div>
      )
    }

    if (error && !groups) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="size-8 text-destructive" />
          <span>{t('pages.proxies.loadFailed')}</span>
          <Button type="button" variant="outline" onClick={() => void mutate()}>
            <RefreshCw className="size-4" />
            {t('pages.proxies.retry')}
          </Button>
        </div>
      )
    }

    return (
      <div className="relative h-[calc(100vh-58px)] min-h-0">
        <ProxyGlobe
          countries={countries as ProxyGlobeCountry[]}
          locale={i18n.language}
          switchingProxy={switchingProxy}
          onSelect={onSelect}
        />
        {countries.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 px-6 text-center text-muted-foreground">
            <Globe2 className="size-8 opacity-70" />
            <span className="text-sm">{t('pages.proxies.noLocations')}</span>
          </div>
        )}
        {unresolvedNodes > 0 && countries.length > 0 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-muted/80 px-3 py-1 text-center text-[11px] text-muted-foreground backdrop-blur">
            {t('pages.proxies.unresolvedLocations', { count: unresolvedNodes })}
          </div>
        )}
      </div>
    )
  }

  return (
    <BasePage title={t('pages.proxies.title')} showBackButton={fromHome}>
      {renderState()}
    </BasePage>
  )
}

export default Proxies
