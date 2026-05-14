import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[calc(var(--radius)-0.15rem)] border border-input/90 bg-background/85 px-3.5 py-2 text-base text-foreground shadow-sm ring-offset-background transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 hover:border-accent/40 focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm lg:h-10 lg:px-3",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
