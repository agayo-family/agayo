export type TicketMode = "general-admission" | "zones" | "seats";
export type SalesState = "open" | "closed" | "coming-soon";

export type TicketCategory = {
  id: string;
  name: string;
  price: number;
  note: string;
  hotTickets?: {
    enabled: boolean;
    displayedRemaining: 1 | 2 | 3 | 4;
  };
  theme?: {
    primary: string;
    secondary: string;
    accent: string;
  };
};

export type AgayoEvent = {
  slug: string;
  title: string;
  dateLabel: string;
  startsAt: string;
  timeLabel: string;
  ageLabel: string;
  city: string;
  alcoholFree: boolean;
  status: "published" | "draft" | "cancelled";
  salesState: SalesState;
  ticketMode: TicketMode;
  heroImage: string;
  posterImage?: string;
  ticketTheme?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  description: string;
  secondaryDescription: string;
  tickets: TicketCategory[];
  program: Array<[string, string]>;
};

export const events: AgayoEvent[] = [
  {
    slug: "vernite-lampovost",
    title: "ВЕРНИТЕ ЛАМПОВОСТЬ",
    dateLabel: "12.09.26",
    startsAt: "2026-09-12T17:30:00+03:00",
    timeLabel: "17:30—21:00",
    ageLabel: "14+",
    city: "Йошкар-Ола",
    alcoholFree: true,
    status: "published",
    salesState: "open",
    ticketMode: "general-admission",
    heroImage: "/events/vernite-lampovost-poster.jpg",
    posterImage: "/events/vernite-lampovost-poster.jpg",
    ticketTheme: { primary: "#220708", secondary: "#751013", accent: "#e12622" },
    description: "Тёплая клубная ночь AGAYO — про людей, музыку и то самое ощущение, ради которого хочется возвращаться.",
    secondaryDescription: "17:30—21:00. Без алкоголя. Приходи за атмосферой, которая останется после последнего трека.",
    tickets: [
      { id: "standard", name: "STANDARD", price: 700, note: "Вход на мероприятие", theme: { primary: "#2b0809", secondary: "#7c1518", accent: "#e12622" } },
    ],
    program: [
      ["17:30", "Открытие дверей"],
      ["18:00", "Начало программы"],
      ["20:30", "Финальный блок"],
      ["21:00", "Завершение"],
    ],
  },
  {
    slug: "agayo-night",
    title: "AGAYO NIGHT",
    dateLabel: "29.08.26",
    startsAt: "2026-08-29T18:00:00+03:00",
    timeLabel: "18:00—21:00",
    ageLabel: "14+",
    city: "Йошкар-Ола",
    alcoholFree: true,
    status: "published",
    salesState: "closed",
    ticketMode: "zones",
    heroImage: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=2200&q=90",
    description: "Музыка, свет и люди, которых ты раньше не знал. Возможно, после этого вечера узнаешь.",
    secondaryDescription: "Без алкоголя. Без необходимости быть кем-то другим. Просто приходи и проживи этот вечер вместе с нами.",
    tickets: [
      { id: "standard", name: "STANDARD", price: 700, note: "Вход на мероприятие" },
      {
        id: "premium",
        name: "PREMIUM",
        price: 1200,
        note: "Приоритетный вход · специальный мерч",
        hotTickets: { enabled: true, displayedRemaining: 3 },
      },
      { id: "vip", name: "VIP", price: 2000, note: "Отдельная зона · максимум привилегий" },
    ],
    program: [
      ["18:00", "Открытие дверей"],
      ["18:30", "Разогрев · DJ set"],
      ["19:15", "Основная программа"],
      ["20:15", "Кульминация вечера"],
      ["21:00", "Финал"],
    ],
  },
  {
    slug: "summer-01",
    title: "SUMMER / 01",
    dateLabel: "09.08.26",
    startsAt: "2026-08-09T18:00:00+03:00",
    timeLabel: "18:00—21:00",
    ageLabel: "14+",
    city: "Йошкар-Ола",
    alcoholFree: true,
    status: "published",
    salesState: "closed",
    ticketMode: "general-admission",
    heroImage: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=85",
    description: "Летний вечер AGAYO, который уже стал частью нашей истории.",
    secondaryDescription: "Фотографии и воспоминания с события остаются в архиве AGAYO.",
    tickets: [],
    program: [],
  },
  {
    slug: "clubshow",
    title: "CLUBSHOW",
    dateLabel: "26.07.26",
    startsAt: "2026-07-26T18:00:00+03:00",
    timeLabel: "18:00—21:00",
    ageLabel: "14+",
    city: "Йошкар-Ола",
    alcoholFree: true,
    status: "published",
    salesState: "closed",
    ticketMode: "general-admission",
    heroImage: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1600&q=85",
    description: "Клабшоу AGAYO из архива прошедших событий.",
    secondaryDescription: "Событие завершено, но его фотографии остаются в галерее.",
    tickets: [],
    program: [],
  },
];

export function getEvent(slug: string) {
  return events.find((event) => event.slug === slug);
}

export function getUpcomingEvent() {
  return events.find((event) => event.status === "published" && event.salesState === "open");
}

export function formatPrice(price: number) {
  return `${new Intl.NumberFormat("ru-RU").format(price)} ₽`;
}
