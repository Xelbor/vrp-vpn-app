import React, { createContext, useContext, ReactNode } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'
import {
  getAppConfig,
  patchAppConfig as patch,
  setProcessVpnEnabled as setProcessVpnEnabledIpc
} from '@renderer/utils/ipc'

interface AppConfigContextType {
  appConfig: AppConfig | undefined
  mutateAppConfig: () => void
  patchAppConfig: (value: Partial<AppConfig>) => Promise<void>
  setProcessVpnEnabled: (processName: string, enabled: boolean) => Promise<void>
}

const AppConfigContext = createContext<AppConfigContextType | undefined>(undefined)

export const AppConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: appConfig, mutate: mutateAppConfig } = useSWR('getConfig', () => getAppConfig())

  const patchAppConfig = async (value: Partial<AppConfig>): Promise<void> => {
    try {
      await patch(value)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      mutateAppConfig()
    }
  }

  const setProcessVpnEnabled = async (processName: string, enabled: boolean): Promise<void> => {
    await setProcessVpnEnabledIpc(processName, enabled)
    await mutateAppConfig()
  }

  React.useEffect(() => {
    window.electron.ipcRenderer.on('appConfigUpdated', () => {
      mutateAppConfig()
    })
    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('appConfigUpdated')
    }
  }, [])

  return (
    <AppConfigContext.Provider
      value={{ appConfig, mutateAppConfig, patchAppConfig, setProcessVpnEnabled }}
    >
      {children}
    </AppConfigContext.Provider>
  )
}

export const useAppConfig = (): AppConfigContextType => {
  const context = useContext(AppConfigContext)
  if (context === undefined) {
    throw new Error('useAppConfig must be used within an AppConfigProvider')
  }
  return context
}
