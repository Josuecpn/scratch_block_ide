-- 6. Adiciona configuração visual do robô (cor do chassi, dimensões e sensores)
ALTER TABLE robot_configs ADD COLUMN visual_json TEXT NOT NULL DEFAULT '{}';
