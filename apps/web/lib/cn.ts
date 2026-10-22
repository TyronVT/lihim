import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know our custom font-size names; otherwise it reads `text-label`
// as a colour and silently drops it when merged with `text-text-1`. Same for the custom
// spacing tokens: without them `cn("p-card", "p-0")` keeps both and the override loses.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["gutter", "card", "card-gap", "section"],
    },
    classGroups: {
      "font-size": [
        { text: ["display", "title", "heading", "body", "label", "caption", "mono", "overline"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
