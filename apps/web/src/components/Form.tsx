import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { ApiRequestError } from '../api/client'

/**
 * Form primitives for the phone (spec 06 §4): 44px targets, 16px inputs (no zoom on iOS),
 * errors in plain words next to the field. Pink is the one primary action (A1).
 */

const inputClass =
  'min-h-11 w-full rounded-card border border-fg-muted/50 bg-ground px-3 text-base text-fg placeholder:text-fg-muted focus-visible:border-action'

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string | undefined
  children: ReactNode
  htmlFor: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-sm text-fg-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={[inputClass, props.className ?? ''].join(' ')} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={[inputClass, props.className ?? ''].join(' ')} />
}

export function Button({
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' }) {
  const base = 'inline-flex min-h-11 items-center justify-center rounded-card px-5 font-medium disabled:opacity-60'
  const look = variant === 'primary' ? 'bg-action text-ground' : 'border border-fg-muted/50 bg-surface text-fg'
  return <button {...props} className={[base, look, props.className ?? ''].join(' ')} />
}

/** A whole-form error: plain words, a request ID in small type (spec 05 §7). */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : 'Something went wrong. Try again.'
  const requestId = error instanceof ApiRequestError ? error.requestId : undefined
  return (
    <div role="alert" className="rounded-card bg-surface p-3 text-sm">
      <p className="font-medium">{message}</p>
      {requestId ? <p className="mt-1 text-xs text-fg-muted tnum">Request {requestId}</p> : null}
    </div>
  )
}

export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-4">
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      {children}
    </section>
  )
}

/** Field-level messages from a Zod issue list or an API `validation` error. */
export function issuesByPath(error: unknown): Record<string, string> {
  if (error instanceof ApiRequestError && error.issues.length > 0) {
    return Object.fromEntries(error.issues.map((issue) => [issue.path, issue.message]))
  }
  return {}
}
