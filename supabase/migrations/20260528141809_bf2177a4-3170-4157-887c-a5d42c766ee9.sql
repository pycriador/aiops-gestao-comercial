CREATE POLICY "admin delete interactions"
ON public.agency_interactions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete hubspot mappings"
ON public.hubspot_mappings
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));