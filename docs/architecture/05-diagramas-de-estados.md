# 5. Diagramas de Estados

> [📚 Índice](README.md) · [← 4. Modelagem de Dados & Diagrama de Classes](04-modelagem-de-dados.md) · [6. Comunicação IPC (Tauri v2) →](06-comunicacao-ipc.md)

## 5.1 Ciclo de Vida da Aplicação

```mermaid
stateDiagram-v2
    [*] --> Booting
    Booting --> Hub : migrações do hub.db OK
    Booting --> FatalError : falha ao abrir hub.db

    Hub --> LoadingProject : abrir / criar projeto
    LoadingProject --> Workspace : projeto carregado
    LoadingProject --> Hub : erro (corrompido, não encontrado)
    LoadingProject --> Migrating : schema antigo
    Migrating --> Workspace : migração OK (snapshot prévio)
    Migrating --> Hub : falha (rollback)

    state Workspace {
        [*] --> Editing
        Editing --> Simulating : Play
        Simulating --> Editing : Stop / fim
        Editing --> Uploading : Enviar ao robô
        Uploading --> Editing : concluído / erro
        --
        [*] --> Clean
        Clean --> Dirty : edição (CanvasOp)
        Dirty --> Saving : debounce 1.5s / Ctrl+S / pré-run
        Saving --> Clean : commit OK
        Saving --> SaveError : falha I/O
        SaveError --> Saving : retry com backoff
        Saving --> Dirty : nova edição durante o save
    }

    Workspace --> ClosingProject : voltar ao Hub / fechar janela
    ClosingProject --> Hub : flush OK
    ClosingProject --> Workspace : usuário cancela
    Hub --> [*] : sair
    FatalError --> [*]
```

> [!NOTE]
> As duas regiões paralelas do `Workspace` (separadas por `--`) mostram que **o modo de interação** (Editing / Simulating / Uploading) e **o estado de persistência** (Clean / Dirty / Saving) são ortogonais. O autosave continua funcionando durante a simulação. Durante `Simulating`, o canvas fica **somente leitura** por padrão; uma configuração permite editar e aplicar a mudança no próximo Reset.

## 5.2 Execução da Simulação / Robô

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> Compiling : Play / Step
    Compiling --> CompileError : diagnostics com erro
    CompileError --> Idle : usuário corrige blocos
    Compiling --> Ready : programa OK (ou cache por hash)

    Ready --> Running : Play
    Ready --> Paused : Step (inicia pausado)

    state Running {
        [*] --> Ticking
        Ticking --> Ticking : fixed step (física + fatia da VM)
        Ticking --> WaitingCondition : bloco "esperar até" / "esperar N s"
        WaitingCondition --> Ticking : condição satisfeita
    }

    Running --> Paused : Pause / breakpoint
    Paused --> Running : Play
    Paused --> Stepping : Step
    Stepping --> Paused : instrução / tick executado

    Running --> Finished : todas as threads da VM terminaram
    Running --> RuntimeError : erro de execução (bloco destacado)
    Running --> Watchdog : loop sem yield por mais de N ms
    Watchdog --> Paused : avisa usuário

    Running --> Resetting : Reset
    Paused --> Resetting : Reset
    Finished --> Resetting : Reset
    RuntimeError --> Resetting : Reset
    Resetting --> Ready : pose inicial + VM reiniciada

    Running --> Idle : Stop
    Paused --> Idle : Stop
    Finished --> Idle : edição nos blocos (invalida programa)
    RuntimeError --> Idle : edição nos blocos
```

**Tabela de transições (contrato entre a UI e o backend):**

| Estado | ▶ Play | ⏸ Pause | ⏭ Step | ⟲ Reset | ⏹ Stop | Edição no canvas |
|--------|:------:|:-------:|:------:|:-------:|:------:|:----------------:|
| Idle | compila → Running | — | compila → Paused | — | — | permitido |
| Ready | Running | — | Paused | — | Idle | invalida → Idle |
| Running | — | Paused | — | Resetting | Idle | bloqueado* |
| Paused | Running | — | Stepping | Resetting | Idle | bloqueado* |
| Finished / RuntimeError | Resetting → Running | — | — | Resetting | Idle | invalida → Idle |

> [!IMPORTANT]
> **O Rust é a fonte de verdade da máquina de estados.** O `simulation.store` (Pinia) é apenas um *espelho*: ele envia **intenções** (`sim_play`), e o estado só muda quando chega o evento `sim://state-changed`. Assim, a UI nunca fica dessincronizada da thread de simulação. Os botões são habilitados a partir da tabela acima.

---

[📚 Índice](README.md) · [← 4. Modelagem de Dados & Diagrama de Classes](04-modelagem-de-dados.md) · [6. Comunicação IPC (Tauri v2) →](06-comunicacao-ipc.md)
