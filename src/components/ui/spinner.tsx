import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin",
        "size-3.5",
        className,
      )}
      aria-hidden
    />
  );
}
