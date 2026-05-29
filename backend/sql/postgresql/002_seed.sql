-- Agency Watch — sample seed data (PostgreSQL)

INSERT INTO consultants (id, name, email, phone, regional, active) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'Ana Consultora', 'ana@loft.com', '5511999000001', 'SP', true),
  ('a1000000-0000-4000-8000-000000000002', 'Bruno Gestor', 'bruno@loft.com', '5511999000002', 'RJ', true)
ON CONFLICT DO NOTHING;

INSERT INTO real_estate_agencies (id, name, city, state, consultant_id, contract_stock, negotiation_status, next_steps, c_level_support_needed) VALUES
  ('b2000000-0000-4000-8000-000000000001', 'Imobiliária Alpha', 'São Paulo', 'SP', 'a1000000-0000-4000-8000-000000000001', 120, 'Em negociação', 'Enviar proposta revisada', false),
  ('b2000000-0000-4000-8000-000000000002', 'Imobiliária Beta', 'Rio de Janeiro', 'RJ', 'a1000000-0000-4000-8000-000000000002', 80, 'Reunião agendada', 'Confirmar reunião C-Level', true),
  ('b2000000-0000-4000-8000-000000000003', 'Imobiliária Gamma', 'Curitiba', 'PR', 'a1000000-0000-4000-8000-000000000001', 45, 'Pipeline de Prospecção', 'Primeiro contato', false)
ON CONFLICT DO NOTHING;
