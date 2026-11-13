import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 px-6 py-14 text-center text-sm text-muted">
      <span className="grid size-12 place-items-center rounded-full border border-line bg-surface-2">
        <Icon className="size-5" />
      </span>
      <div className="max-w-sm">{children}</div>
    </div>
  )
}
