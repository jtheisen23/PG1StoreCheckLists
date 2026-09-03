"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const VARIANTS = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300 border-transparent",
  secondary:
    "border hover:bg-[var(--surface-sunken)] disabled:opacity-50 bg-[var(--surface-raised)]",
  ghost: "border-transparent hover:bg-[var(--surface-sunken)] disabled:opacity-50",
  danger: "border-transparent text-white hover:opacity-90 disabled:opacity-50",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13px]",
  lg: "h-11 px-5 text-[15px]",
} as const;

type Variant = keyof typeof VARIANTS;
type Size = keyof typeof SIZES;

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      {...props}
      className={cn(base, VARIANTS[variant], SIZES[size], className)}
      style={
        variant === "danger" ? { background: "var(--fail)" } : props.style
      }
    />
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(base, VARIANTS[variant], SIZES[size], className)}
    >
      {children}
    </Link>
  );
}
