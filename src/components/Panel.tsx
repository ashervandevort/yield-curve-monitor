'use client'

import { cn } from '@/lib/utils'

interface PanelProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  variant?: 'default' | 'elevated' | 'inset' | 'flush'
  accent?: 'orange' | 'cyan' | 'green' | 'red' | 'yellow' | 'none'
}

const ACCENT_CLASSES: Record<string, string> = {
  orange: 'border-l-[2px] !border-l-bloomberg-orange',
  cyan:   'border-l-[2px] !border-l-bloomberg-cyan',
  green:  'border-l-[2px] !border-l-bloomberg-green',
  red:    'border-l-[2px] !border-l-bloomberg-red',
  yellow: 'border-l-[2px] !border-l-bloomberg-yellow',
  none:   '',
}

const VARIANT_CLASSES: Record<string, string> = {
  default:  'panel',
  elevated: 'panel-elevated',
  inset:    'panel-inset',
  flush:    'rounded-[3px]',
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  variant = 'default',
  accent = 'none',
}: PanelProps) {
  return (
    <div className={cn(VARIANT_CLASSES[variant], ACCENT_CLASSES[accent], className)}>
      {(title || actions) && (
        <div className="panel-header">
          <div className="flex items-center gap-2">
            {title && <span className="panel-title">{title}</span>}
            {subtitle && <span className="panel-subtitle">{subtitle}</span>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('panel-body', bodyClassName)}>{children}</div>
    </div>
  )
}
