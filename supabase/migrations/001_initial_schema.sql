-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- gear_profiles — one per user, links to Supabase auth.users
-- ============================================================
CREATE TABLE gear_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  wading_setup    TEXT CHECK (wading_setup IN ('wet', 'waders')) NOT NULL DEFAULT 'waders',
  tippet_sizes    TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {"4X","5X","6X"}
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_profile_id UUID REFERENCES gear_profiles(id) ON DELETE CASCADE NOT NULL,
  make            TEXT NOT NULL,
  length_ft       NUMERIC(4,1) NOT NULL,
  weight_class    INTEGER NOT NULL  -- line weight, e.g. 4, 5, 6
);

CREATE TABLE reels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_profile_id UUID REFERENCES gear_profiles(id) ON DELETE CASCADE NOT NULL,
  make            TEXT NOT NULL,
  line_weight     INTEGER NOT NULL
);

CREATE TABLE lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_profile_id UUID REFERENCES gear_profiles(id) ON DELETE CASCADE NOT NULL,
  type            TEXT CHECK (type IN ('floating', 'sink-tip', 'full-sink')) NOT NULL,
  weight          INTEGER NOT NULL
);

CREATE TABLE leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_profile_id UUID REFERENCES gear_profiles(id) ON DELETE CASCADE NOT NULL,
  material        TEXT CHECK (material IN ('mono', 'fluoro', 'furled')) NOT NULL,
  length_ft       NUMERIC(4,1) NOT NULL
);

CREATE TABLE fly_boxes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gear_profile_id UUID REFERENCES gear_profiles(id) ON DELETE CASCADE NOT NULL,
  category        TEXT CHECK (category IN ('dry', 'nymph', 'streamer', 'emerger')) NOT NULL,
  patterns        TEXT[] NOT NULL DEFAULT '{}'
);

-- ============================================================
-- catch_reports — community submissions
-- ============================================================
CREATE TABLE catch_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  spot_name        TEXT NOT NULL,
  latitude         NUMERIC(9,6),
  longitude        NUMERIC(9,6),
  species          TEXT NOT NULL,
  method           TEXT,                 -- 'dry', 'nymph', 'streamer', etc.
  fly_pattern      TEXT,
  water_conditions TEXT,
  gear_notes       TEXT,
  report_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-update updated_at on gear_profiles modification
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER gear_profiles_set_updated_at
  BEFORE UPDATE ON gear_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a gear_profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.gear_profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Row-level security
-- ============================================================
ALTER TABLE gear_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fly_boxes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE catch_reports ENABLE ROW LEVEL SECURITY;

-- gear_profiles: own row only
CREATE POLICY "Users manage own gear profile"
  ON gear_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- gear sub-tables: access via gear_profile ownership
CREATE POLICY "Users manage own rods"
  ON rods FOR ALL
  USING (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()))
  WITH CHECK (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own reels"
  ON reels FOR ALL
  USING (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()))
  WITH CHECK (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own lines"
  ON lines FOR ALL
  USING (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()))
  WITH CHECK (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own leaders"
  ON leaders FOR ALL
  USING (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()))
  WITH CHECK (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own fly boxes"
  ON fly_boxes FOR ALL
  USING (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()))
  WITH CHECK (gear_profile_id IN (SELECT id FROM gear_profiles WHERE user_id = auth.uid()));

-- catch_reports: own writes, public reads
CREATE POLICY "Anyone can read catch reports"
  ON catch_reports FOR SELECT
  USING (true);

CREATE POLICY "Users insert own catch reports"
  ON catch_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own catch reports"
  ON catch_reports FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own catch reports"
  ON catch_reports FOR DELETE
  USING (auth.uid() = user_id);
