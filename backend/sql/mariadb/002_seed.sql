-- Agency Watch — sample seed data (MariaDB)

INSERT IGNORE INTO consultants (id, name, email, phone, regional, active) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'Ana Consultora', 'ana@loft.com', '5511999000001', 'SP', 1),
  ('a1000000-0000-4000-8000-000000000002', 'Bruno Gestor', 'bruno@loft.com', '5511999000002', 'RJ', 1);

INSERT IGNORE INTO real_estate_agencies (id, name, city, state, consultant_id, contract_stock, negotiation_status, next_steps, c_level_support_needed) VALUES
  ('b2000000-0000-4000-8000-000000000001', 'Imobiliária Alpha', 'São Paulo', 'SP', 'a1000000-0000-4000-8000-000000000001', 120, 'Em negociação', 'Enviar proposta revisada', 0),
  ('b2000000-0000-4000-8000-000000000002', 'Imobiliária Beta', 'Rio de Janeiro', 'RJ', 'a1000000-0000-4000-8000-000000000002', 80, 'Reunião agendada', 'Confirmar reunião C-Level', 1),
  ('b2000000-0000-4000-8000-000000000003', 'Imobiliária Gamma', 'Curitiba', 'PR', 'a1000000-0000-4000-8000-000000000001', 45, 'Pipeline de Prospecção', 'Primeiro contato', 0);
