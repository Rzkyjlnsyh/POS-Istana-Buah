import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type AlertVariant = 'danger' | 'warning' | 'success' | 'info';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
}

const VARIANT_STYLES: Record<AlertVariant, { container: string; icon: typeof AlertCircle }> = {
  danger: {
    container: 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
    icon: AlertCircle,
  },
  warning: {
    container: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
    icon: AlertTriangle,
  },
  success: {
    container: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
    icon: CheckCircle2,
  },
  info: {
    container: 'border-semantic-info-border bg-semantic-info-bg text-semantic-info-ink',
    icon: Info,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  role,
  ...props
}: AlertProps) {
  const style = VARIANT_STYLES[variant];
  const IconComponent = style.icon;
  const computedRole = role ?? (variant === 'danger' || variant === 'warning' ? 'alert' : 'status');

  return (
    <div
      role={computedRole}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm leading-relaxed',
        style.container,
        className,
      )}
      {...props}
    >
      <IconComponent className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title ? 'mt-0.5' : undefined)}>{children}</div>
      </div>
    </div>
  );
}
