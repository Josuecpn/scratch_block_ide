# RoboBlocks IDE — Documentação de Arquitetura

> **Stack atual:** Tauri v2 (Rust 1.97.1) · Vue 3 + TypeScript + Pinia · SQLite3 (`tauri-plugin-sql`) · Three.js (WebGL 3D) · `mise`
> **Público:** estudantes de robótica educacional (programação em blocos estilo LEGO SPIKE Prime / Essential)

## 📚 Índice

| # | Documento | Conteúdo |
|---|-----------|----------|
| 0 | [Decisões Arquiteturais (ADRs)](00-decisoes-arquiteturais.md) | Decisões-chave de arquitetura e justificativas |
| 1 | [Arquitetura & Estrutura de Pastas](01-arquitetura-e-estrutura-de-pastas.md) | Visão em camadas e estrutura real implementada no repositório |
| 2 | [Diretrizes de UI/UX](02-diretrizes-ui-ux.md) | Layout do Hub e do Workspace, atalhos e acessibilidade |
| 3 | [Casos de Uso](03-casos-de-uso.md) | Atores, diagrama e detalhamento dos casos de uso centrais |
| 4 | [Modelagem de Dados & Classes](04-modelagem-de-dados.md) | Diagrama de classes e modelo relacional SQLite3 |
| 5 | [Diagramas de Estados](05-diagramas-de-estados.md) | Ciclo de vida da aplicação e máquina de estados da simulação |
| 6 | [Comunicação IPC (Tauri v2)](06-comunicacao-ipc.md) | Commands, compilação MicroPython e exportação `.llsp3` |
| 7 | [Próximos Passos](07-proximos-passos.md) | Resumo do roadmap e link para o planejamento evolutivo |
| 8 | [Roadmap Evolutivo](../ROADMAP.md) | Lista detalhada de melhorias futuras |
