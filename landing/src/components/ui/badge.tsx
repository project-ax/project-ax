"use client";

import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium font-mono",
        "rounded-lg border border-accent/20 bg-accent-subtle text-accent-glow",
        className
      )}
    >
      {children}
    </span>
  );
}
