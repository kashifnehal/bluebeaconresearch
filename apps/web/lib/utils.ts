import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNowStrict } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFormatDistanceToNow(
  dateInput: any,
  options?: { addSuffix?: boolean },
): string {
  if (!dateInput) return "recently";
  try {
    const d =
      typeof dateInput === "string" || typeof dateInput === "number"
        ? new Date(dateInput)
        : dateInput;
    if (!(d instanceof Date) || isNaN(d.getTime())) {
      return "recently";
    }
    return formatDistanceToNowStrict(d, options);
  } catch {
    return "recently";
  }
}
