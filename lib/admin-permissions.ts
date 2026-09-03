export type AdminRole = "owner" | "administrator" | "organizer" | "controller";

export const ADMIN_PERMISSIONS = [
  { id: "view_dashboard", label: "Открывать обзор админки", group: "ОБЩЕЕ" },
  { id: "manage_events", label: "Создавать и редактировать мероприятия", group: "МЕРОПРИЯТИЯ" },
  { id: "publish_events", label: "Публиковать и снимать мероприятия", group: "МЕРОПРИЯТИЯ" },
  { id: "manage_ticket_inventory", label: "Менять категории, цены и количество билетов", group: "БИЛЕТЫ" },
  { id: "manage_hot_tickets", label: "Управлять «Горячими билетами»", group: "БИЛЕТЫ" },
  { id: "issue_comp_tickets", label: "Выпускать бесплатные билеты", group: "БИЛЕТЫ" },
  { id: "cancel_tickets", label: "Отменять билеты", group: "БИЛЕТЫ" },
  { id: "refund_tickets", label: "Оформлять возвраты", group: "ФИНАНСЫ" },
  { id: "view_buyers", label: "Видеть покупателей и контакты", group: "ПОЛЬЗОВАТЕЛИ" },
  { id: "view_revenue", label: "Видеть выручку и платежи", group: "ФИНАНСЫ" },
  { id: "view_statistics", label: "Смотреть статистику мероприятий", group: "АНАЛИТИКА" },
  { id: "scan_tickets", label: "Сканировать QR на входе", group: "КОНТРОЛЬ ВХОДА" },
  { id: "manual_ticket_search", label: "Искать билет вручную", group: "КОНТРОЛЬ ВХОДА" },
  { id: "manage_promos", label: "Создавать и менять промокоды", group: "ПРОМО" },
  { id: "manage_media", label: "Управлять фото и отзывами", group: "КОНТЕНТ" },
  { id: "manage_loyalty", label: "Менять уровни лояльности пользователей", group: "ПОЛЬЗОВАТЕЛИ" },
  { id: "manage_team", label: "Выдавать роли и права команде", group: "СИСТЕМА" },
  { id: "manage_system", label: "Менять критические настройки системы", group: "СИСТЕМА" },
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]["id"];

const ALL = ADMIN_PERMISSIONS.map((item) => item.id) as AdminPermission[];

export const ROLE_DEFAULTS: Record<AdminRole, AdminPermission[]> = {
  owner: ALL,
  administrator: ALL.filter((permission) => permission !== "manage_system"),
  organizer: [
    "view_dashboard", "manage_events", "publish_events", "manage_ticket_inventory",
    "manage_hot_tickets", "issue_comp_tickets", "cancel_tickets", "view_buyers",
    "view_statistics", "manual_ticket_search", "manage_promos", "manage_media",
  ],
  controller: ["view_dashboard", "scan_tickets", "manual_ticket_search"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "OWNER",
  administrator: "ADMINISTRATOR",
  organizer: "ORGANIZER",
  controller: "CONTROLLER",
};

export function isAdminPermission(value: string): value is AdminPermission {
  return ADMIN_PERMISSIONS.some((item) => item.id === value);
}
