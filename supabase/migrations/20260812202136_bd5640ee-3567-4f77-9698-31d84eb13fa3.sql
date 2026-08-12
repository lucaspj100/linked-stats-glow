REVOKE ALL ON FUNCTION public.protect_installation_privileged_fields() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM public, anon, authenticated;