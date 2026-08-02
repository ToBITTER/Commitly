import { RentSplitError } from "./errors.js";

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function toCents(value, fieldName = "amount") {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RentSplitError(`${fieldName} must be a valid money amount.`);
    }
    value = String(value);
  }

  if (typeof value !== "string" || !MONEY_PATTERN.test(value.trim())) {
    throw new RentSplitError(`${fieldName} must be a positive money amount with up to 2 decimals.`);
  }

  const [whole, decimal = ""] = value.trim().split(".");
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(decimal.padEnd(2, "0"), 10);

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new RentSplitError(`${fieldName} must be greater than 0.`);
  }

  return cents;
}

export function centsToMoney(cents) {
  if (!Number.isSafeInteger(cents)) {
    throw new RentSplitError("Money value is outside the supported range.");
  }

  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const decimal = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${decimal}`;
}

export function splitEvenly(totalCents, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new RentSplitError("At least one participant is required to split an expense.");
  }

  const baseShare = Math.floor(totalCents / userIds.length);
  const remainder = totalCents % userIds.length;

  return userIds.map((userId, index) => ({
    userId,
    amountCents: baseShare + (index < remainder ? 1 : 0),
  }));
}
