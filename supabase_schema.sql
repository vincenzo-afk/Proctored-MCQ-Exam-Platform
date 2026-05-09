-- Supabase Schema for Proctored MCQ Exam App

-- 1. Create exams table
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  questions jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Create results table
CREATE TABLE IF NOT EXISTS public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  email text NOT NULL,
  topic text NOT NULL,
  score integer NOT NULL,
  total integer NOT NULL,
  percentage integer NOT NULL,
  pass boolean NOT NULL,
  date timestamp with time zone DEFAULT now(),
  answers jsonb NOT NULL,
  photos jsonb NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
-- Note: Since the app currently relies on manual email entry without strict Supabase Auth,
-- we allow anon access for reading and writing. In a production app with Supabase Auth, 
-- you would restrict this using `auth.uid()`.

CREATE POLICY "Allow anon read exams" ON public.exams FOR SELECT USING (true);
CREATE POLICY "Allow anon insert exams" ON public.exams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon delete exams" ON public.exams FOR DELETE USING (true);

CREATE POLICY "Allow anon read results" ON public.results FOR SELECT USING (true);
CREATE POLICY "Allow anon insert results" ON public.results FOR INSERT WITH CHECK (true);
