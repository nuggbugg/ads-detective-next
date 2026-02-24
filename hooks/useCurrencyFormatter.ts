"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Shared hook for formatting currency amounts based on user settings.
 * Returns a formatter function: (amount, decimals?) => string
 */
export function useCurrencyFormatter() {
  const currencyData = useQuery(api.settings.getCurrency);
  return (amount: number, decimals = 2) => {
    if (!currencyData) return `$${(amount || 0).toFixed(decimals)}`;
    const num = (amount || 0).toFixed(decimals);
    return currencyData.position === "after"
      ? `${num} ${currencyData.symbol}`
      : `${currencyData.symbol}${num}`;
  };
}
