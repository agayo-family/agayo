export type RefundPolicyQuote = {
  daysBeforeEvent: number;
  percent: 0 | 30 | 50 | 100;
  label: string;
};

function moscowDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

function dateSerial(value: Date) {
  const { year, month, day } = moscowDateParts(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getRefundPolicyQuote(startsAt: string | Date, now = new Date()): RefundPolicyQuote {
  const eventDate = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(eventDate.valueOf())) return { daysBeforeEvent: 0, percent: 0, label: "Дата события не определена" };

  const daysBeforeEvent = dateSerial(eventDate) - dateSerial(now);
  if (daysBeforeEvent >= 10) return { daysBeforeEvent, percent: 100, label: "За 10 дней и более · возврат 100%" };
  if (daysBeforeEvent >= 5) return { daysBeforeEvent, percent: 50, label: "От 5 до 10 дней · возврат 50%" };
  if (daysBeforeEvent >= 3) return { daysBeforeEvent, percent: 30, label: "От 3 до 5 дней · возврат 30%" };
  return { daysBeforeEvent, percent: 0, label: "Менее чем за 3 дня · возврат по этой политике недоступен" };
}

export function refundAmountForShare(paidShare: number, percent: number) {
  const cents = Math.max(0, Math.round(Number(paidShare || 0) * 100));
  const refundCents = Math.max(0, Math.round(cents * Math.max(0, Math.min(100, percent)) / 100));
  return refundCents / 100;
}
