
-- ============ Enums & roles ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  font_size INTEGER NOT NULL DEFAULT 16,
  font_family TEXT NOT NULL DEFAULT 'serif',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

-- Auto-create profile + default 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ Categories & Books ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO authenticated, anon;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_read_all" ON public.categories FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "categories_admin_write" ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_url TEXT,
  pdf_path TEXT,
  total_pages INTEGER,
  display_order INTEGER NOT NULL,
  global_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.books TO authenticated, anon;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "books_read_all" ON public.books FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "books_admin_write" ON public.books FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX books_global_order_idx ON public.books(global_order);

-- ============ Reading progress ============
CREATE TABLE public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  current_page INTEGER NOT NULL DEFAULT 1,
  total_pages INTEGER,
  completed BOOLEAN NOT NULL DEFAULT false,
  quiz_passed BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_progress TO authenticated;
GRANT ALL ON public.user_progress TO service_role;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_own" ON public.user_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Helper: is a book unlocked for a user? (all prior books quiz_passed)
CREATE OR REPLACE FUNCTION public.is_book_unlocked(_user_id UUID, _book_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _g INTEGER;
  _unpassed INTEGER;
BEGIN
  SELECT global_order INTO _g FROM public.books WHERE id = _book_id;
  IF _g IS NULL THEN RETURN false; END IF;
  IF _g = 1 THEN RETURN true; END IF;
  SELECT COUNT(*) INTO _unpassed
  FROM public.books b
  LEFT JOIN public.user_progress p ON p.book_id = b.id AND p.user_id = _user_id
  WHERE b.global_order < _g AND COALESCE(p.quiz_passed, false) = false;
  RETURN _unpassed = 0;
END;
$$;

-- ============ Bookmarks, Highlights, Notes, Vocabulary ============
CREATE TABLE public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks_own" ON public.bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'yellow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.highlights TO authenticated;
GRANT ALL ON public.highlights TO service_role;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "highlights_own" ON public.highlights FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page INTEGER,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_own" ON public.notes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  word TEXT NOT NULL,
  definition TEXT,
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocabulary TO authenticated;
GRANT ALL ON public.vocabulary TO service_role;
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vocab_own" ON public.vocabulary FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ Quizzes ============
CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- array of 4 strings
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_read_auth" ON public.quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "quiz_admin_write" ON public.quiz_questions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  answers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts_own" ON public.quiz_attempts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Seed 6 categories + 30 placeholder books ============
INSERT INTO public.categories (name, description, display_order) VALUES
  ('Foundations of Influence', 'Core principles of persuasion and psychological influence', 1),
  ('Dark Triad Dynamics', 'Narcissism, Machiavellianism, and psychopathy in everyday life', 2),
  ('Manipulation Tactics', 'Recognizing covert and overt manipulation strategies', 3),
  ('Interpersonal Defense', 'Boundaries, assertiveness, and protecting your psyche', 4),
  ('Cognitive Reframing', 'Rewiring thought patterns to resist coercion', 5),
  ('Mastery & Application', 'Synthesis and real-world application of all prior material', 6);

INSERT INTO public.books (category_id, title, author, description, display_order, global_order)
SELECT c.id, b.title, b.author, b.description, b.local_order, b.global_order FROM public.categories c
JOIN (VALUES
  (1, 'Influence: Principles I',                'TBD', 'Reciprocity, commitment, social proof.', 1, 1),
  (1, 'Influence: Principles II',               'TBD', 'Authority, liking, scarcity.',           2, 2),
  (1, 'The Psychology of Persuasion',           'TBD', 'How beliefs shift under pressure.',      3, 3),
  (1, 'Cognitive Biases Field Guide',           'TBD', 'Catalog of mental shortcuts adversaries exploit.', 4, 4),
  (1, 'Behavioral Economics Primer',            'TBD', 'Nudges, anchors, and framing.',          5, 5),
  (2, 'The Mask of Sanity',                     'TBD', 'Introduction to psychopathy.',           1, 6),
  (2, 'Narcissism Decoded',                     'TBD', 'Grandiose vs vulnerable narcissism.',    2, 7),
  (2, 'Machiavellian Mind',                     'TBD', 'Strategic deception and power moves.',   3, 8),
  (2, 'The Sociopath Next Door',                'TBD', 'Everyday predators in plain sight.',     4, 9),
  (2, 'Dark Triad in the Workplace',            'TBD', 'How toxic actors climb organizations.',  5, 10),
  (3, 'Covert Manipulation Tactics',            'TBD', 'Gaslighting, DARVO, triangulation.',     1, 11),
  (3, 'Coercive Control',                       'TBD', 'Patterns of domination in relationships.', 2, 12),
  (3, 'The Art of the Long Con',                'TBD', 'Grooming and long-game manipulation.',   3, 13),
  (3, 'Emotional Blackmail',                    'TBD', 'Fear, obligation, and guilt.',           4, 14),
  (3, 'Cult Dynamics',                          'TBD', 'High-control groups and thought reform.', 5, 15),
  (4, 'Boundaries that Hold',                   'TBD', 'Setting and enforcing limits.',          1, 16),
  (4, 'Assertive Communication',                'TBD', 'Saying no without apology.',             2, 17),
  (4, 'Grey Rock & No Contact',                 'TBD', 'Disengagement protocols.',               3, 18),
  (4, 'Recognizing Red Flags',                  'TBD', 'Early-warning signs and patterns.',      4, 19),
  (4, 'Recovery After Manipulation',            'TBD', 'Trauma-aware healing roadmap.',          5, 20),
  (5, 'Cognitive Reframing Basics',             'TBD', 'CBT-style thought restructuring.',       1, 21),
  (5, 'Defusing Trauma Bonds',                  'TBD', 'Breaking intermittent-reinforcement loops.', 2, 22),
  (5, 'Self-Trust Restoration',                 'TBD', 'Rebuilding intuition after gaslighting.', 3, 23),
  (5, 'Inner Critic Recalibration',             'TBD', 'Disarming internalized attacker voices.', 4, 24),
  (5, 'Identity After Influence',               'TBD', 'Reclaiming your authentic self.',        5, 25),
  (6, 'Strategic Self-Defense Playbook',        'TBD', 'Putting it all into practice.',          1, 26),
  (6, 'Negotiating with Difficult People',      'TBD', 'Hostage-negotiator-grade tactics.',      2, 27),
  (6, 'Building an Inner Circle',               'TBD', 'Vetting and curating safe relationships.', 3, 28),
  (6, 'Leadership without Manipulation',        'TBD', 'Ethical influence at scale.',            4, 29),
  (6, 'Mastery & Integration',                  'TBD', 'Capstone synthesis of the curriculum.',  5, 30)
) AS b(cat_order, title, author, description, local_order, global_order) ON c.display_order = b.cat_order;
