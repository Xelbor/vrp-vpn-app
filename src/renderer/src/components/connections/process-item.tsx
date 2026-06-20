import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { useProcessIcon, useProcessAppName } from '@renderer/store/icons-store'
import { calcTraffic } from '@renderer/utils/calc'
import React, { memo, useMemo } from 'react'
import { ChevronRight, ShieldCheck, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface ProcessGroup {
  processPath: string
  processName: string
  hasProcess: boolean
  activeCount: number
  closedCount: number
  totalUpload: number
  totalDownload: number
  totalUploadSpeed: number
  totalDownloadSpeed: number
}

interface Props {
  process: ProcessGroup
  displayIcon: boolean
  displayAppName: boolean
  vpnBypassed: boolean
  vpnPending: boolean
  onClick: (processPath: string) => void
  onToggleVpn: (processName: string, enabled: boolean) => void
}

const ProcessItemComponent: React.FC<Props> = ({
  process,
  displayIcon,
  displayAppName,
  vpnBypassed,
  vpnPending,
  onClick,
  onToggleVpn
}) => {
  const { t } = useTranslation()
  const iconUrl = useProcessIcon(process.processPath, displayIcon)
  const appName = useProcessAppName(process.processPath, displayAppName)

  const uploadTraffic = useMemo(() => calcTraffic(process.totalUpload), [process.totalUpload])
  const downloadTraffic = useMemo(
    () => calcTraffic(process.totalDownload),
    [process.totalDownload]
  )

  const uploadSpeed = useMemo(
    () => (process.totalUploadSpeed ? calcTraffic(process.totalUploadSpeed) : null),
    [process.totalUploadSpeed]
  )
  const downloadSpeed = useMemo(
    () => (process.totalDownloadSpeed ? calcTraffic(process.totalDownloadSpeed) : null),
    [process.totalDownloadSpeed]
  )

  const hasSpeed = useMemo(
    () => Boolean(process.totalUploadSpeed || process.totalDownloadSpeed),
    [process.totalUploadSpeed, process.totalDownloadSpeed]
  )

  const name = appName || process.processName || t('pages.connections.unknownProcess')
  const hasActive = process.activeCount > 0
  const vpnOn = !vpnBypassed

  return (
    <div className="px-1 pb-2" style={{ height: 134 }}>
      <div
        className={`
          group relative w-full h-full flex flex-col rounded-xl border overflow-hidden
          transition-all duration-200 ease-out
          ${
            vpnBypassed
              ? 'border-amber-500/30 bg-amber-500/[0.04] backdrop-blur-xl hover:border-amber-500/50'
              : hasActive
                ? 'border-stroke-power-on/30 backdrop-blur-xl bg-linear-to-br from-gradient-start-power-on/[0.06] to-card/40 hover:border-stroke-power-on/50 shadow-sm'
                : 'border-border bg-card/50 backdrop-blur-xl hover:bg-accent/50'
          }
        `}
      >
        {/* Top: icon + name + counts (clickable to drill into connections) */}
        <div
          className="flex items-center gap-3 p-3 cursor-pointer min-w-0"
          onClick={() => onClick(process.processPath)}
        >
          {displayIcon &&
            (iconUrl ? (
              <img src={iconUrl} className="size-11 shrink-0" />
            ) : (
              <div className="size-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-muted-foreground">
                  {name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            ))}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{name}</span>
              <ChevronRight className="text-muted-foreground/40 size-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center gap-1 mt-1">
              {hasActive && (
                <Badge className="min-w-4 h-4 justify-center px-1 leading-none text-[10px] bg-gradient-end-power-on text-white border-0">
                  {process.activeCount}
                </Badge>
              )}
              {process.closedCount > 0 && (
                <Badge
                  variant="outline"
                  className="min-w-4 h-4 justify-center px-1 leading-none text-[10px] text-muted-foreground"
                >
                  {process.closedCount}
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground truncate">
                {'↑'} {uploadTraffic} {'↓'} {downloadTraffic}
              </span>
            </div>
          </div>
        </div>

        {/* Speed line */}
        {hasSpeed && (
          <div className="px-3 -mt-1 pb-1">
            <span
              className={`text-[11px] ${hasActive && !vpnBypassed ? 'text-gradient-end-power-on' : 'text-muted-foreground'}`}
            >
              {'↑'} {uploadSpeed || '0 B'}/s {'↓'} {downloadSpeed || '0 B'}/s
            </span>
          </div>
        )}

        {/* Bottom: VPN toggle */}
        <div className="mt-auto flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 min-w-0">
            {vpnOn ? (
              <ShieldCheck className="size-4 shrink-0 text-gradient-end-power-on" />
            ) : (
              <ShieldOff className="size-4 shrink-0 text-amber-500" />
            )}
            <span
              className={`text-xs font-medium truncate ${vpnOn ? 'text-gradient-end-power-on' : 'text-amber-500'}`}
            >
              {vpnPending
                ? t('pages.connections.vpnApplying')
                : vpnOn
                  ? t('pages.connections.vpnEnabled')
                  : t('pages.connections.vpnDisabled')}
            </span>
          </div>
          <Switch
            size="sm"
            checked={vpnOn}
            disabled={!process.hasProcess || vpnPending}
            title={t('pages.connections.vpnToggleHint')}
            onCheckedChange={(checked) => onToggleVpn(process.processName, checked)}
          />
        </div>
      </div>
    </div>
  )
}

const ProcessItem = memo(ProcessItemComponent, (prevProps, nextProps) => {
  const prev = prevProps.process
  const next = nextProps.process
  return (
    prev.processPath === next.processPath &&
    prev.activeCount === next.activeCount &&
    prev.closedCount === next.closedCount &&
    prev.totalUpload === next.totalUpload &&
    prev.totalDownload === next.totalDownload &&
    prev.totalUploadSpeed === next.totalUploadSpeed &&
    prev.totalDownloadSpeed === next.totalDownloadSpeed &&
    prev.hasProcess === next.hasProcess &&
    prevProps.displayIcon === nextProps.displayIcon &&
    prevProps.displayAppName === nextProps.displayAppName &&
    prevProps.vpnBypassed === nextProps.vpnBypassed &&
    prevProps.vpnPending === nextProps.vpnPending
  )
})

export default ProcessItem
