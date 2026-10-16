export type AdminTicketTheme = { themePrimary?: string; themeSecondary?: string; themeAccent?: string };

function hex(value: unknown) {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : undefined;
}

// Keep category colors independently of the event palette. New categories have
// no override and follow the event colors until their first save.
export function storedAdminTicketTheme(category: { theme_primary?: unknown; theme_secondary?: unknown; theme_accent?: unknown }): AdminTicketTheme {
  return { themePrimary: hex(category.theme_primary), themeSecondary: hex(category.theme_secondary), themeAccent: hex(category.theme_accent) };
}

export function adminTicketThemePayload(category: AdminTicketTheme, event: AdminTicketTheme) {
  return {
    themePrimary: hex(category.themePrimary) || hex(event.themePrimary) || '#220708',
    themeSecondary: hex(category.themeSecondary) || hex(event.themeSecondary) || '#751013',
    themeAccent: hex(category.themeAccent) || hex(event.themeAccent) || '#e12622',
  };
}
