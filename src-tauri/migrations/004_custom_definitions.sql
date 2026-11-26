-- 7. Adiciona definições customizadas do projeto (variáveis, listas, mensagens e Meus Blocos)
ALTER TABLE canvas_states ADD COLUMN definitions_json TEXT NOT NULL DEFAULT '{}';
