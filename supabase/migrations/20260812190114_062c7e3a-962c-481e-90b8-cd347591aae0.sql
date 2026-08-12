-- 1. Papéis
CREATE TYPE public.app_role AS ENUM ('admin', 'seller');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 2. Perfis de vendedor
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  crm_user_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_name_idx ON public.profiles (name);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Vendedor só pode alterar o próprio perfil e não pode mexer em role/crm/active
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.crm_user_id := OLD.crm_user_id;
    NEW.active := OLD.active;
    NEW.email := OLD.email;
    NEW.user_id := OLD.user_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profiles_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- 3. Instalações: vínculo opcional com vendedor (retrocompatível)
ALTER TABLE public.extension_installations
  ADD COLUMN IF NOT EXISTS seller_user_id uuid;

DROP POLICY IF EXISTS "Authenticated users can read installations" ON public.extension_installations;
DROP POLICY IF EXISTS "Authenticated users can update installations" ON public.extension_installations;
DROP POLICY IF EXISTS "Authenticated users can delete installations" ON public.extension_installations;

CREATE POLICY "Read own or all installations"
ON public.extension_installations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

CREATE POLICY "Admins can update installations"
ON public.extension_installations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete installations"
ON public.extension_installations FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Eventos de mensagem: vendedor vê só os próprios
CREATE OR REPLACE FUNCTION public.can_read_message_event(_person_name text, _installation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.name = _person_name
    )
    OR EXISTS (
      SELECT 1 FROM public.extension_installations i
      WHERE i.id = _installation_id AND i.seller_user_id = auth.uid()
    )
$$;

DROP POLICY IF EXISTS "Authenticated users can read message events" ON public.message_events;

CREATE POLICY "Read own or all message events"
ON public.message_events FOR SELECT TO authenticated
USING (public.can_read_message_event(person_name, installation_id));
