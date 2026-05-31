import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent",
        ghost:
          "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        /* Status variants — match the bespoke .bdg-g / .bdg-y / etc. */
        green:
          "bg-status-green-bg text-status-green before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-50",
        yellow:
          "bg-status-yellow-bg text-status-yellow before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-50",
        blue:
          "bg-status-blue-bg text-status-blue before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-50",
        red:
          "bg-status-red-bg text-status-red before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-50",
        purple:
          "bg-status-purple-bg text-status-purple before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-50",
        orange:
          "bg-status-orange-bg text-status-orange before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
