import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { platform } from '@renderer/utils/init'
import WindowControls from '@renderer/components/window-controls'
import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

const sidebarPaths = new Set(['/home', '/proxies', '/connections', '/rules', '/logs', '/settings'])
const isMac = platform === 'darwin'

interface Props {
  title?: React.ReactNode
  header?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showBackButton?: boolean
}

const BasePage = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = !sidebarPaths.has(location.pathname)

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="w-full h-full">
      <div className="sticky top-0 z-40 h-14.25 w-full">
        <div className="app-drag px-2 pt-3 pb-2 flex justify-between h-14.25">
          <div className="title ml-15 flex h-full min-w-0 flex-1 items-center gap-1 text-lg leading-8">
            {(isSubPage || props.showBackButton) && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="app-nodrag"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {props.title}
          </div>
          <div className="header flex h-full shrink-0 items-center gap-1">
            {props.header}
            {!isMac && <WindowControls />}
          </div>
        </div>
      </div>
      <div
        className={cn(
          'content h-[calc(100vh-57px)] overflow-y-auto custom-scrollbar sm:pl-[calc(var(--sidebar-width-icon)+(--spacing(4)))]',
          props.contentClassName
        )}
      >
        {props.children}
      </div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
