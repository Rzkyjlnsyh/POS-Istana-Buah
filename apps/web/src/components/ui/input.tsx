import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError = false, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={hasError || undefined}
        className={cn(
          'flex min-h-11 w-full rounded-xl border bg-surface-panel px-3.5 py-2.5 text-base text-ink-primary transition-colors duration-150 placeholder:text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-70',
          hasError
            ? 'border-semantic-danger focus-visible:outline-semantic-danger'
            : 'border-border-strong hover:border-primary-700 focus-visible:border-primary-700 focus-visible:outline-primary-700',
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
