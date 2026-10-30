# 0. Decisões Arquiteturais (ADRs)

> [📚 Índice](README.md) · [1. Arquitetura de Alto Nível & Estrutura de Pastas →](01-arquitetura-e-estrutura-de-pastas.md)

| # | Decisão | Justificativa |
|---|---------|---------------|
| ADR-01 | **A simulação (física + VM) roda no Rust**; o frontend só *renderiza* | Passo de tempo fixo e determinístico (60–120 Hz), sem travar a UI; reaproveitado no modo headless (testes, correção automática de desafios). |
| ADR-02 | **Os blocos são compilados para uma IR (AST) → bytecode próprio (VM do simulador)** e **→ MicroPython** (robô real) | Uma única fonte de verdade. O bytecode carrega `block_id` em cada instrução → destaque do bloco em execução e modo passo a passo. |
| ADR-03 | **Um arquivo SQLite por projeto (`*.robo`)** + um **`hub.db` global** | Igual à Godot: cada projeto é portátil (o aluno manda um arquivo só para o professor). O `hub.db` guarda projetos recentes, templates e configurações. |
| ADR-04 | **A persistência fica do lado do Rust** (`sqlx` + migrações), exposta por *commands* tipados | Nada de SQL no frontend, menor superfície exposta via capabilities, transações atômicas. O `tauri-plugin-sql` serve para um MVP/protótipo, mas não é o recomendado para produção. |
| ADR-05 | **Editor de blocos: Blockly com renderer `zelos`** (visual Scratch/Spike), envolvido num componente Vue | Maduro, acessível e extensível. Fica isolado atrás de uma interface `BlockEditorAdapter` para permitir trocar por um editor próprio no futuro. |
| ADR-06 | **Contrato IPC gerado automaticamente** com `tauri-specta` | Tipos TypeScript gerados a partir do Rust: os dois lados nunca ficam dessincronizados. |
| ADR-07 | **Telemetria de alta frequência via `tauri::ipc::Channel`**; eventos só para notificações de baixa frequência | Channels são ordenados e otimizados para streaming. Já o sistema de eventos não foi feito para 60 msg/s. |

---

[📚 Índice](README.md) · [1. Arquitetura de Alto Nível & Estrutura de Pastas →](01-arquitetura-e-estrutura-de-pastas.md)
