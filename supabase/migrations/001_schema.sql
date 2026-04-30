-- ============================================================
-- Migration 001: Full schema with profiles, RLS, triggers
-- Run in the Supabase SQL Editor
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── clients ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── reports ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name TEXT NOT NULL,
  report_date TEXT NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── report_files ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_display_order ON clients(display_order);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports(created_by);
CREATE INDEX IF NOT EXISTS idx_report_files_report_id ON report_files(report_id);

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── auto-create profile on user signup ──────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_app_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── enable RLS ───────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_files ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies if they exist
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;
DROP POLICY IF EXISTS "Allow all operations on reports" ON reports;
DROP POLICY IF EXISTS "Allow all operations on report_files" ON report_files;

-- ── profiles RLS ─────────────────────────────────────────────
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles"
  ON profiles FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins update profiles"
  ON profiles FOR UPDATE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── clients RLS ──────────────────────────────────────────────
CREATE POLICY "Authenticated read clients"
  ON clients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins insert clients"
  ON clients FOR INSERT
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins update clients"
  ON clients FOR UPDATE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins delete clients"
  ON clients FOR DELETE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── reports RLS ──────────────────────────────────────────────
CREATE POLICY "Users insert own reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins read all reports"
  ON reports FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins update reports"
  ON reports FOR UPDATE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── report_files RLS ─────────────────────────────────────────
CREATE POLICY "Users insert report files"
  ON report_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins read report files"
  ON report_files FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── Storage bucket + RLS ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT DO NOTHING;

-- Storage objects RLS: only admins can read or write stored reports
CREATE POLICY "Admins full access to reports bucket"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'reports'
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'reports'
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );
