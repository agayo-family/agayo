export type Organizer = {
  id: string;
  name: string;
  role: string;
  description: string;
  photoUrl: string;
  photoAlt: string;
  visible: boolean;
};

export type AboutContent = {
  eyebrow: string;
  title: string;
  intro: string;
  description: string;
  tags: string[];
  statement: string;
  teamTitle: string;
  teamDescription: string;
  organizers: Organizer[];
};

export const defaultAboutContent: AboutContent = {
  eyebrow: "AGAYO / МЫ — СВОИ",
  title: "МЫ —\nСВОИ.",
  intro: "Мы обычные подростки. Учимся, гуляем, знакомимся, смеёмся над тупыми шутками и иногда вообще не знаем, чем заняться вечером.",
  description: "Поэтому создаём вечера, которые сами хотели бы прожить.",
  tags: ["14+", "Йошкар-Ола", "Alcohol Free"],
  statement: "Прожить молодость так, чтобы её захотелось вспомнить.",
  teamTitle: "Люди за\nэтими вечерами.",
  teamDescription: "Знакомься с командой AGAYO.",
  organizers: [],
};

export class ContentValidationError extends Error {}

function text(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string") throw new ContentValidationError(`Проверь поле «${label}»`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new ContentValidationError(`«${label}»: ${required ? "от 1 до" : "до"} ${max} символов`);
  return result;
}

// These hosts match Next Image's allowlist. SVG/data URLs and remote fetches to
// arbitrary hosts are never accepted as an organizer portrait.
export function isOrganizerPhotoUrl(value: string) {
  if (!value) return true;
  if (/^\/(?!\/)[a-zA-Z0-9/_-]+\.(?:jpe?g|png|webp|avif)$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !/\.svg$/i.test(url.pathname) &&
      (url.hostname === "images.unsplash.com" || /^[a-zA-Z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname));
  } catch { return false; }
}

export function parseAboutContent(value: unknown): AboutContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContentValidationError("Некорректное содержимое страницы");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.tags)) throw new ContentValidationError("Проверь метки страницы");
  const tags = input.tags.map((tag) => text(tag, "Метка", 45, false)).filter(Boolean);
  if (tags.length > 6) throw new ContentValidationError("Можно добавить до 6 меток");
  if (!Array.isArray(input.organizers) || input.organizers.length > 24) throw new ContentValidationError("Можно добавить до 24 организаторов");
  const ids = new Set<string>();
  const organizers = input.organizers.map((raw, index): Organizer => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ContentValidationError("Проверь карточку организатора");
    const item = raw as Record<string, unknown>;
    const id = text(item.id, "ID организатора", 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new ContentValidationError("Карточки организаторов должны иметь разные ID");
    ids.add(id);
    if (typeof item.visible !== "boolean") throw new ContentValidationError("Проверь видимость карточки");
    const photoUrl = text(item.photoUrl, "Фотография", 2000, false);
    if (!isOrganizerPhotoUrl(photoUrl)) throw new ContentValidationError("Загрузи фотографию через кнопку в карточке или используй ссылку Vercel Blob");
    return {
      id, name: text(item.name, `Имя организатора ${index + 1}`, 100),
      role: text(item.role, "Роль организатора", 120, false),
      description: text(item.description, "Описание организатора", 1600, false),
      photoUrl, photoAlt: text(item.photoAlt, "Подпись фотографии", 200, false), visible: item.visible,
    };
  });
  return {
    eyebrow: text(input.eyebrow, "Надпись над заголовком", 100),
    title: text(input.title, "Заголовок", 160),
    intro: text(input.intro, "Первый абзац", 3000),
    description: text(input.description, "Второй абзац", 3000, false),
    tags,
    statement: text(input.statement, "Большая фраза", 300),
    teamTitle: text(input.teamTitle, "Заголовок команды", 160),
    teamDescription: text(input.teamDescription, "Вступление к команде", 1000, false),
    organizers,
  };
}

export function parseContentVersion(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ContentValidationError("Перезагрузи редактор и попробуй ещё раз");
  return value;
}
