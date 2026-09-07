-- AGAYO v13.1 — гибкая система лояльности
-- Применить после db/008_production_launch.sql.

ALTER TABLE loyalty_levels
  ADD COLUMN IF NOT EXISTS auto_by_visits boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS conditions_text text NOT NULL DEFAULT '';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS loyalty_override_level text,
  ADD COLUMN IF NOT EXISTS loyalty_override_note text,
  ADD COLUMN IF NOT EXISTS loyalty_override_at timestamptz;

-- Стартовые понятные условия. Их можно полностью переписать в админке.
UPDATE loyalty_levels SET conditions_text='Базовый уровень AGAYO.'
WHERE level_key='NEW' AND conditions_text='';
UPDATE loyalty_levels SET conditions_text='Автоматически после первого посещённого мероприятия.'
WHERE level_key='INSIDE' AND conditions_text='';
UPDATE loyalty_levels SET conditions_text='Для постоянных гостей AGAYO. Условия можно изменить вручную.'
WHERE level_key='REGULAR' AND conditions_text='';
UPDATE loyalty_levels SET conditions_text='Особый уровень AGAYO. Может назначаться автоматически или вручную командой.'
WHERE level_key='GOLD' AND conditions_text='';
UPDATE loyalty_levels SET conditions_text='Высший уровень AGAYO. Условия определяет команда.'
WHERE level_key='LEGEND' AND conditions_text='';

CREATE INDEX IF NOT EXISTS users_loyalty_override_idx
  ON users(loyalty_override_level)
  WHERE loyalty_override_level IS NOT NULL;
