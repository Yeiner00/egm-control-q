import * as React from "react";

import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full rounded-[calc(var(--radius)-0.15rem)] border border-input/90 bg-background/85 px-3.5 py-2.5 text-sm text-foreground shadow-sm ring-offset-background transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/80 hover:border-accent/40 focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
