import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium transition-all duration-150 outline-none cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-ring/15 active:scale-[0.97] active:brightness-95 disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:   "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-secondary bg-secondary text-secondary-foreground hover:bg-muted",
        outline:   "border-border bg-card text-foreground hover:bg-accent",
        ghost:     "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "border-destructive bg-destructive text-white hover:bg-destructive/90",
        /* Status color variants — match bespoke .btn-g / .btn-r / etc. */
        green:  "border-transparent bg-status-green-bg text-status-green hover:opacity-90",
        red:    "border-transparent bg-status-red-bg text-status-red hover:opacity-90",
        blue:   "border-transparent bg-status-blue-bg text-status-blue hover:opacity-90",
        purple: "border-transparent bg-status-purple-bg text-status-purple hover:opacity-90",
        orange: "border-transparent bg-status-orange-bg text-status-orange hover:opacity-90",
      },
      size: {
        default: "h-10 px-4",
        sm:      "h-8 px-3 text-xs",
        lg:      "h-11 px-6",
        icon:    "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
