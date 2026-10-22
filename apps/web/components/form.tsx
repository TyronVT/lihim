"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Minus, Plus } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { Icon } from "./icons";

// Inputs are 16 px (text-body) everywhere: anything smaller makes iOS zoom on focus.
const controlBase =
  "w-full rounded-sm border border-border-control bg-surface px-3 text-body text-text-1 placeholder:text-text-3 " +
  "transition-[border-color,box-shadow] duration-fast hover:border-text-3 " +
  "aria-invalid:border-danger disabled:opacity-40";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Right-aligned text by the label, e.g. "24/80". */
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired with aria-describedby. Used by every field below. */
export function Field({ id, label, hint, error, counter, children, className }: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label text-text-2">
          {label}
        </label>
        {counter && <span className="text-caption text-text-3 tabular">{counter}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: ReactNode) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** Single-line input, 48 px tall, radius 8, 16 px text. */
export function TextField({ label, hint, error, counter, id: idProp, className, ...rest }: TextFieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} hint={hint} error={error} counter={counter} className={className}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlBase, "h-12")}
        {...rest}
      />
    </Field>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Multi-line input, min 96 px, 16 px text. */
export function TextArea({ label, hint, error, counter, id: idProp, className, rows = 3, ...rest }: TextAreaProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} hint={hint} error={error} counter={counter} className={className}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlBase, "min-h-24 resize-y py-3")}
        {...rest}
      />
    </Field>
  );
}

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Labelled switch row, e.g. L5 "Hide results until closing", L10 "Poll alerts". The WHOLE row
 * (min 56 px) is the hit target (R9): it's a <label> for the switch, so a tap anywhere toggles.
 */
export function Switch({ checked, onCheckedChange, label, description, disabled, id: idProp, className }: SwitchProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-14 items-center justify-between gap-4",
        disabled ? "cursor-default opacity-40" : "cursor-pointer",
        className,
      )}
    >
      <span className="flex flex-col">
        <span id={`${id}-label`} className="text-body text-text-1">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="text-caption text-text-3">
            {description}
          </span>
        )}
      </span>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-fast",
          "border-border-control bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "block size-5 translate-x-1 rounded-full bg-text-2 transition-transform duration-fast ease-out",
            "data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-bg",
          )}
        />
      </SwitchPrimitive.Root>
    </label>
  );
}

export interface SegmentedControlProps<V extends string> {
  value: V;
  onValueChange: (value: V) => void;
  options: { value: V; label: string }[];
  /** Accessible name for the group. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Choose-one control (Radix RadioGroup; arrows select — fine here, nothing is committed).
 * E.g. L5 poll type: Single choice / Yes–No / Rating 1–5.
 */
export function SegmentedControl<V extends string>({ value, onValueChange, options, label, disabled, className }: SegmentedControlProps<V>) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      aria-label={label}
      disabled={disabled}
      orientation="horizontal"
      className={cn("flex w-full gap-1 rounded-md border border-border bg-surface p-0.5", disabled && "opacity-40", className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "min-h-12 flex-1 rounded-sm px-1 text-label whitespace-nowrap text-text-2 transition-colors duration-fast",
            "hover:text-text-1 data-[state=checked]:bg-surface-raised data-[state=checked]:text-text-1 data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]",
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: ReactNode;
  /** Shown under the control — L1 uses it for "why min size exists". */
  hint?: ReactNode;
  /** Unit after the number, e.g. "members". */
  unit?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Number stepper with 48 px − / + buttons. The value is a spinbutton (arrow keys,
 * Home/End) so screen readers announce it. L1 min group size: default 8, min 5.
 */
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, label, hint, unit, disabled, id: idProp, className }: StepperProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const set = (n: number) => {
    const v = clamp(n);
    if (v !== value) onChange(v);
  };
  const btn =
    "inline-flex size-12 items-center justify-center rounded-md border border-border-control text-text-1 transition-colors duration-fast hover:bg-surface-raised disabled:opacity-40";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span id={`${id}-label`} className="text-label text-text-2">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} aria-label={copy.common.decrease} onClick={() => set(value - step)} disabled={disabled || value <= min}>
          <Icon icon={Minus} />
        </button>
        <div
          id={id}
          role="spinbutton"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={unit ? `${value} ${unit}` : undefined}
          aria-disabled={disabled || undefined}
          onKeyDown={(e) => {
            if (disabled) return;
            const map: Record<string, number> = { ArrowUp: value + step, ArrowRight: value + step, ArrowDown: value - step, ArrowLeft: value - step, Home: min, End: max };
            const next = map[e.key];
            if (next !== undefined) {
              e.preventDefault();
              set(next);
            }
          }}
          className="flex h-12 min-w-20 flex-1 items-center justify-center gap-1.5 rounded-md bg-surface text-heading text-text-1 tabular"
        >
          {formatCount(value)}
          {unit && <span className="text-label text-text-2">{unit}</span>}
        </div>
        <button type="button" className={btn} aria-label={copy.common.increase} onClick={() => set(value + step)} disabled={disabled || value >= max}>
          <Icon icon={Plus} />
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-text-3">
          {hint}
        </p>
      )}
    </div>
  );
}
