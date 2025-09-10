import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function assetPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ""
  if (path.startsWith("http")) return path
  if (!base) return path
  if (path.startsWith("/")) return `${base}${path}`
  return `${base}/${path}`
}
