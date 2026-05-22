import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[0.42rem] text-sm font-semibold ring-offset-background transition-[background-color,color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-primary/20 bg-primary text-primary-foreground shadow-[0_14px_28px_-16px_hsl(var(--primary)/0.72)] hover:bg-primary/95 hover:shadow-[0_18px_32px_-18px_hsl(var(--primary)/0.76)] dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50 dark:shadow-none dark:hover:border-cyan-300/45 dark:hover:bg-cyan-400/25",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input/85 bg-card/82 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-accent/45 hover:bg-accent/10 hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/88",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 lg:h-9 lg:px-3.5",
        sm: "h-9 px-3.5 lg:h-8 lg:px-3",
        lg: "h-11 px-8 lg:h-10 lg:px-6",
        icon: "h-10 w-10 lg:h-9 lg:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
