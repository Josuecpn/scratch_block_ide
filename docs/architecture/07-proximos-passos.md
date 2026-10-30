# 7. Próximos Passos

> [📚 Índice](README.md) · [← 6. Comunicação IPC (Tauri v2)](06-comunicacao-ipc.md)

1. **Spike técnico (1–2 semanas):** Blockly com `zelos` + Pixi 2D + `robo-sim` com rapier2d, validando um seguidor de linha a 60 FPS com o destaque de blocos funcionando.
2. **Scaffolding:** `npm create tauri-app` (Vue + TS), workspace Cargo com os 3 crates e `tauri-specta` configurado.
3. **Migrações** `hub/0001` e `project/0001` + repositórios + `apply_canvas_ops` com testes de integridade do grafo.
4. **Compilador mínimo:** blocos Eventos, Movimento e Controle → IR → bytecode, com testes *golden*.
5. **Simulação 3D** (rapier3d + TresJS) atrás da mesma interface `Renderer`, com o backend de física escolhido por *feature flag*.

---

[📚 Índice](README.md) · [← 6. Comunicação IPC (Tauri v2)](06-comunicacao-ipc.md)
