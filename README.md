# RoboBlocks IDE

Ambiente desktop de programação visual por blocos e **simulação 3D de robótica educacional** inspirado no ecossistema **LEGO Education SPIKE** (Prime e Essential).

---

## Visão Geral

O **RoboBlocks IDE** permite criar, editar e simular projetos robóticos offline-first com persistência local em SQLite3:

* **Hub de Projetos:** tela inicial dedicada para gerenciar projetos salvos, criar novos projetos a partir de **Área Limpa** ou **Código de Exemplo**, e selecionar o kit alvo (**SPIKE Prime** com portas `A–F` ou **SPIKE Essential** com portas `A–B`).
* **Programação Visual em Blocos:** paleta contínua com *Scroll-Spy* através de todas as categorias (**Motores, Movimento, Luz, Som, Eventos, Controle, Sensores, Operadores, Variáveis, Listas e Meus Blocos**), suporte a *drag-and-drop*, blocos C/E (`repete`, `se/então/senão`), *reporters* em pílula, booleanos hexagonais, matriz de pixels 5×5, dial circular de curva (`-100..+100`) e seletor visual de cores.
* **Simulador 3D Real (Three.js / WebGL):**
  * Câmera orbital livre (`OrbitControls`), iluminação direcional com sombras e modelo 3D articulado do robô.
  * **Cinemática diferencial contínua (`requestAnimationFrame`):** acoplamento real entre motores/rodas e deslocamento do chassi, calibração de distância por rotação (`cm/rotação`) e fator de atrito do piso.
  * **Sensor de Cor, Luz RGB e Modo Camaleão:** leitura das linhas e zonas de cor da arena com reflexo em tempo real no LED emissivo + `PointLight` do Hub 3D.
  * **Editor de Arena e Customizador do Robô:** adição/movimentação/rotação de obstáculos, paredes, linhas e zonas de cor/atrito diretamente no 3D, além de personalização de chassi, dimensões e sensores.
* **Ecossistema LEGO SPIKE:** compilação em tempo real para **MicroPython** (SPIKE v3 e Pybricks), exportação e importação com round-trip 1:1 (`.llsp3`, `.llsp`, `.py` e `.json`).

---

## Stack Tecnológica & Requisitos

* **Desktop Core:** [Tauri v2](https://v2.tauri.app/) · **Rust `1.97.1`** (`edition = 2024`)
* **Frontend:** Vue 3 + TypeScript (strict) + Vite + Pinia
* **Gráficos 3D:** Three.js (`WebGLRenderer`, `OrbitControls`, `Raycaster`)
* **Banco de Dados Local:** SQLite3 via `@tauri-apps/plugin-sql` (modo WAL + migrações automáticas `001` a `005`)
* **Gerenciamento de Ambiente:** [`mise`](https://mise.jdx.dev/) (`.mise.toml` + `rust-toolchain.toml`, Node `24` + Rust `1.97.1`)

### Como Executar em Desenvolvimento

```bash
# 1. Instalar runtimes padronizados (Node 24 e Rust 1.97.1) e dependências
mise install
mise run setup

# 2. Validar tipos TypeScript e compilação Rust
mise run check

# 3. Iniciar a aplicação Tauri v2 em modo desenvolvimento
mise run dev
```

### Tasks de Build e Qualidade (`.mise.toml`)

| Comando | Descrição |
|---|---|
| `mise run check` | Executa `vue-tsc --noEmit` (frontend) e `cargo check` (backend) |
| `mise run test` | Executa os testes unitários do backend Rust (`cargo test`) |
| `mise run build:linux` | Gera pacotes Linux (`.deb`, `.rpm`, `.AppImage`) para `x86_64-unknown-linux-gnu` |
| `mise run build:windows` | Cross-compila para Windows (`x86_64-pc-windows-msvc` via `cargo-xwin`) |
| `mise run build:macos` | Gera pacote macOS Apple Silicon (`aarch64-apple-darwin`, requer host/CI macOS) |

---

## Índice de Navegação da Documentação (`docs/`)

* **[docs/ROADMAP.md](docs/ROADMAP.md)** — Próximos passos técnicos e funcionais planejados para a evolução da IDE.
* **[docs/architecture/README.md](docs/architecture/README.md)** — Índice geral da documentação de arquitetura.
* **[docs/architecture/00-decisoes-arquiteturais.md](docs/architecture/00-decisoes-arquiteturais.md)** — Decisões Arquiteturais (ADRs).
* **[docs/architecture/01-arquitetura-e-estrutura-de-pastas.md](docs/architecture/01-arquitetura-e-estrutura-de-pastas.md)** — Visão em camadas e estrutura real de diretórios do projeto.
* **[docs/architecture/02-diretrizes-ui-ux.md](docs/architecture/02-diretrizes-ui-ux.md)** — Diretrizes de interface, Hub, Workspace e acessibilidade.
* **[docs/architecture/03-casos-de-uso.md](docs/architecture/03-casos-de-uso.md)** — Atores e especificação dos casos de uso centrais.
* **[docs/architecture/04-modelagem-de-dados.md](docs/architecture/04-modelagem-de-dados.md)** — Modelagem relacional SQLite3 e classes de domínio.
* **[docs/architecture/05-diagramas-de-estados.md](docs/architecture/05-diagramas-de-estados.md)** — Ciclo de vida da aplicação e máquina de estados da simulação.
* **[docs/architecture/06-comunicacao-ipc.md](docs/architecture/06-comunicacao-ipc.md)** — Comunicação IPC entre Vue 3 e Rust no Tauri v2.
* **[docs/architecture/07-proximos-passos.md](docs/architecture/07-proximos-passos.md)** — Resumo de conclusão da fase inicial e link para o Roadmap.
