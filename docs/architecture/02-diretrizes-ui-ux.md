# 2. Diretrizes de UI/UX

> [📚 Índice](README.md) · [← 1. Arquitetura de Alto Nível & Estrutura de Pastas](01-arquitetura-e-estrutura-de-pastas.md) · [3. Casos de Uso →](03-casos-de-uso.md)

**Hub (estilo Godot Project Manager):**
```text
┌───────────────────────────────────────────────────────────────────────┐
│ 🤖 RoboBlocks   [Projetos] [Templates] [Desafios] [Aprender]   ⚙  👤 │
├──────────────┬────────────────────────────────────────────────────────┤
│ + Novo       │ 🔍 Buscar...                 Ordenar: Recentes ▾ ▦ ☰  │
│ 📂 Importar  │ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ 🔎 Escanear  │ │thumbnail │ │thumbnail │ │thumbnail │                 │
│              │ │Seguidor  │ │Sumô      │ │Labirinto │                 │
│ ── Progresso │ │de linha  │ │2D · Spike│ │3D · Spike│                 │
│ ⭐ 12 desafios│ │há 2 h  ★ │ │ontem     │ │3 dias    │                 │
│ 🔥 5 dias    │ └──────────┘ └──────────┘ └──────────┘                 │
└──────────────┴────────────────────────────────────────────────────────┘
```
- Cards grandes, com thumbnail da arena gerada no último save, além de um badge 2D/3D e do modelo do robô.
- Templates: "Robô Vazio", "Seguidor de Linha", "Sumô", "Labirinto", "Desafio FLL".
- Gamificação leve: sequência de dias e desafios concluídos. Nada intrusivo.

**Workspace (estilo editor Godot):**
```text
┌ Toolbar: ◀ Hub │ Projeto ▾ │ [Script] [Simulação] [⇆ Split] │ ▶ ⏸ ⏭ ⟲ │ 🔌 Robô ┐
├────────┬───────────────────────────────┬──────────────────────────────┬────────┤
│Paleta  │  Canvas de blocos             │  Viewport 2D/3D              │Inspetor│
│● Movim.│  ┌ quando programa iniciar ┐  │      ▢   🤖 →                │Sensores│
│● Motor │  │ mover 10 cm             │  │   ────────────               │ cor: 🟥│
│● Senso.│  │ repetir até ...         │  │                              │ dist:12│
│● Contr.│  └─────────────────────────┘  │                              │ gyro:90│
│● Oper. │                               │                              │        │
│● Variá.│                               │                              │        │
├────────┴───────────────────────────────┴──────────────────────────────┴────────┤
│ Console │ Diagnósticos │ Código Python                         Salvo ✓ · 60 FPS │
└───────────────────────────────────────────────────────────────────────────────┘
```
- **Dock layout** redimensionável (splitters), com o estado persistido por projeto em `layout.store`.
- **Atalhos:** `F5` Play, `F6` Pause, `F10` Step, `Ctrl+R` Reset, `Ctrl+\` alterna split, `Ctrl+Z/Y` desfaz/refaz.
- **Feedback em tempo real:** o bloco em execução ganha brilho, e um erro mostra um balão no bloco com a mensagem em linguagem amigável.
- **Acessibilidade:** tema de alto contraste, cores das categorias com ícone além da cor (para daltonismo), zoom no canvas e navegação por teclado no Blockly.

---

[📚 Índice](README.md) · [← 1. Arquitetura de Alto Nível & Estrutura de Pastas](01-arquitetura-e-estrutura-de-pastas.md) · [3. Casos de Uso →](03-casos-de-uso.md)
