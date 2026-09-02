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
  id: "AGY-260912-STD-0047",
  eventSlug: "vernite-lampovost",
  eventTitle: "ВЕРНИТЕ ЛАМПОВОСТЬ",
  eventDate: "12.09.26",
  eventTime: "17:30—21:00",
  city: "Йошкар-Ола",
  ownerName: "СЕРГЕЙ",
  category: "STANDARD",
  zone: "DANCE FLOOR",
  status: "valid",
};

export const ticketStatusLabels: Record<TicketStatus, string> = {
  valid: "ДЕЙСТВИТЕЛЕН",
  used: "ИСПОЛЬЗОВАН",
  refunded: "ВОЗВРАЩЁН",
  cancelled: "ОТМЕНЁН",
};
