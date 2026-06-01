import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold transition-colors",
  {
    variants: {
      variant: {
        grade10: "bg-gold/20 text-gold border border-gold/30",
        grade9: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
        grade8: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
        default: "bg-white/10 text-white/70 border border-white/10",
        destructive: "bg-red-600/20 text-red-400 border border-red-500/30",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
