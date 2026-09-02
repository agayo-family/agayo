export type TicketStatus = "valid" | "used" | "refunded" | "cancelled";

export type DigitalTicket = {
  id: string;
  eventSlug: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  city: string;
  ownerName: string;
  category: string;
  zone?: string;
  seat?: string;
  status: TicketStatus;
  usedAt?: string;
};

export const demoTicket: DigitalTicket = {
  id: "AGY-260829-PREM-0047",
  eventSlug: "agayo-night",
  eventTitle: "AGAYO NIGHT",
  eventDate: "29.08.26",
  eventTime: "18:00—21:00",
  city: "Йошкар-Ола",
  ownerName: "СЕРГЕЙ",
  category: "PREMIUM",
  zone: "A",
  status: "valid",
};

export const ticketStatusLabels: Record<TicketStatus, string> = {
  valid: "ДЕЙСТВИТЕЛЕН",
  used: "ИСПОЛЬЗОВАН",
  refunded: "ВОЗВРАЩЁН",
  cancelled: "ОТМЕНЁН",
};
