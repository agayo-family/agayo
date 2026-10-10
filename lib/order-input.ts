/** Never clamp malformed input: the reservation and charged quantity must agree. */
export function parseTicketQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6 ? value : null;
}
