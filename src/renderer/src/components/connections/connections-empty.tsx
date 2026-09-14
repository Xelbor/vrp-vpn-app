import { Button } from '@renderer/components/ui/button'
import type { LucideIcon } from 'lucide-react'
import type { FC } from 'react'

interface Props {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

const ConnectionsEmpty: FC<Props> = ({ icon: Icon, title, description, action }) => {
  return (
    <div className="flex h-full min-h-48 items-center justify-center px-6 py-8 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-balance">
            {description}
          </p>
        )}
        {action && (
          <Button type="button" variant="secondary" className="mt-4" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}

export default ConnectionsEmpty
