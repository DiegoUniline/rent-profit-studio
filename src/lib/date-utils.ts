/**
 * Utility functions for handling dates consistently across the application.
 * 
 * The main issue: When parsing a date string like "2026-01-01" using new Date(),
 * JavaScript interprets it as UTC midnight. If the user is in a timezone like UTC-6,
 * this becomes "2025-12-31 18:00:00" local time, showing the previous day.
 * 
 * Solution: Always append "T00:00:00" to treat the date as local time, or parse
 * the date parts manually.
 */

/**
 * Parses a date string (YYYY-MM-DD) as local time, avoiding UTC conversion issues.
 * This is the recommended way to parse date-only strings from the database.
 */
export function parseLocalDate(dateStr: string): Date {
  // Append T00:00:00 to force local time interpretation
  return new Date(dateStr + "T00:00:00");
}

/**
 * Formats a date string from the database for display in Spanish (Mexico) locale.
 * Uses short month format: "1 ene 2026"
 */
export function formatDateShort(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a date string from the database for display in Spanish (Mexico) locale.
 * Uses long format with weekday: "miércoles, 1 de enero de 2026"
 */
export function formatDateLong(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Formats a date string from the database in dd/MM/yyyy format.
 */
export function formatDateNumeric(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
