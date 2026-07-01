-- ============================================================
-- 002_richer_gear.sql — granular gear model
--
-- Flies become first-class rows (flat by default, optional box grouping);
-- tippet becomes spools instead of an array on the profile; rods/reels/lines/
-- leaders gain the attributes the planner needs to reason about matches.
--
-- Preset vocabularies are GLOBALLY FIXED in the app (src/lib/gear/presets.ts)
-- but users may also type a custom value, so the enum CHECK constraints on the
-- affected columns are relaxed to plain TEXT. Matching logic keys off the preset
-- values; custom values simply don't participate in automated matching.
--
-- Apply in the Supabase SQL editor. Idempotent-ish: safe to re-run.
-- ============================================================

BEGIN;

-- ── gear_profiles: remember the user's preferred fly sort ─────────────────────
ALTER TABLE gear_profiles ADD COLUMN IF NOT EXISTS fly_sort TEXT NOT NULL DEFAULT 'category';

-- ── rods: model, action, pieces ────────────────────────────────────────────────
ALTER TABLE rods ADD COLUMN IF NOT EXISTS model  TEXT;
ALTER TABLE rods ADD COLUMN IF NOT EXISTS action TEXT;      -- slow | medium | fast (+ custom)
ALTER TABLE rods ADD COLUMN IF NOT EXISTS pieces INTEGER;

-- ── reels: model, arbor ─────────────────────────────────────────────────────────
ALTER TABLE reels ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS arbor TEXT;      -- standard | mid | large (+ custom)

-- ── lines: taper + sink rate; relax the type enum ────────────────────────────────
ALTER TABLE lines DROP CONSTRAINT IF EXISTS lines_type_check;
ALTER TABLE lines ADD COLUMN IF NOT EXISTS taper    TEXT;           -- WF | DT | level (+ custom)
ALTER TABLE lines ADD COLUMN IF NOT EXISTS sink_ips NUMERIC(3,1);   -- inches/sec (sinking lines only)

-- ── leaders: relax material enum; add tippet_x ──────────────────────────────────
ALTER TABLE leaders DROP CONSTRAINT IF EXISTS leaders_material_check;
ALTER TABLE leaders ADD COLUMN IF NOT EXISTS tippet_x TEXT;         -- X-rating at the business end

-- ── flies: first-class, flat by default, optional box ───────────────────────────
CREATE TABLE IF NOT EXISTS flies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_profile_id UUID REFERENCES gear_profiles(id) ON DELETE CASCADE NOT NULL,
  box_id          UUID REFERENCES fly_boxes(id) ON DELETE SET NULL,   -- unassigned = loose fly
  pattern         TEXT NOT NULL,                 -- "Parachute Adams"
  category        TEXT NOT NULL,                 -- dry|nymph|emerger|streamer|wet|terrestrial|midge (+ custom)
  hook_size       INTEGER,                       -- matching key: hook ÷ 4 ≈ tippet X
  color           TEXT,
  weighted        BOOLEAN NOT NULL DEFAULT false,
  quantity        INTEGER,                       -- NULL = untracked
  imitates        TEXT,                          -- taxon hint for hatch matching ("baetis", "pmd")
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS flies_gear_profile_id_idx ON flies(gear_profile_id);
CREATE INDEX IF NOT EXISTS flies_box_id_idx          ON flies(box_id);

-- ── tippet_spools: replaces gear_profiles.tippet_sizes ──────────────────────────
CREATE TABLE IF NOT EXISTS tippet_spools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_profile_id UUID REFERENCES gear_profiles(id) ON DELETE CASCADE NOT NULL,
  x_size          TEXT NOT NULL,                 -- 0X..8X (+ custom)
  material        TEXT NOT NULL DEFAULT 'mono',  -- mono | fluoro (+ custom)
  breaking_lb     NUMERIC(3,1),
  low_stock       BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS tippet_spools_gear_profile_id_idx ON tippet_spools(gear_profile_id);

-- ── Backfill from the old model (before dropping the source columns) ─────────────
-- Explode each fly box's patterns[] into flies rows, keeping the box as container.
INSERT INTO flies (gear_profile_id, box_id, pattern, category)
SELECT fb.gear_profile_id, fb.id, TRIM(p), fb.category
FROM fly_boxes fb
CROSS JOIN LATERAL unnest(fb.patterns) AS p
WHERE TRIM(p) <> '';

-- Explode each profile's tippet_sizes[] into mono spools.
INSERT INTO tippet_spools (gear_profile_id, x_size, material)
SELECT gp.id, TRIM(x), 'mono'
FROM gear_profiles gp
CROSS JOIN LATERAL unnest(gp.tippet_sizes) AS x
WHERE TRIM(x) <> '';

-- ── Reshape fly_boxes into optional labeled containers ──────────────────────────
ALTER TABLE fly_boxes ADD COLUMN IF NOT EXISTS label TEXT;
UPDATE fly_boxes SET label = INITCAP(category) || ' box' WHERE label IS NULL;
ALTER TABLE fly_boxes DROP CONSTRAINT IF EXISTS fly_boxes_category_check;
ALTER TABLE fly_boxes DROP COLUMN IF EXISTS category;
ALTER TABLE fly_boxes DROP COLUMN IF EXISTS patterns;

-- ── Drop the migrated array column ──────────────────────────────────────────────
ALTER TABLE gear_profiles DROP COLUMN IF EXISTS tippet_sizes;

-- ── Row-level security on the new tables (same ownership-via-profile pattern) ────
ALTER TABLE flies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tippet_spools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own flies" ON flies;
CREATE POLICY "Users manage own flies"
  ON flies FOR ALL
  USING (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()))
  WITH CHECK (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own tippet spools" ON tippet_spools;
CREATE POLICY "Users manage own tippet spools"
  ON tippet_spools FOR ALL
  USING (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()))
  WITH CHECK (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()));

COMMIT;
