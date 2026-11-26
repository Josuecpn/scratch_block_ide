# Roadmap — Próximos Passos do RoboBlocks IDE

Este documento lista os próximos passos técnicos e funcionais recomendados a partir do estágio atual da aplicação (Simulador 3D Three.js + Cinemática Diferencial + Editor de Blocos completo + SQLite3 + Exportação/Importação `.llsp3`/`.py`).

## 1. Simulação 3D e Sensores Avançados
- **Sensor Ultrassônico & Colisão Física:** Integrar a leitura de distância por *raycast* (`portD_distanceCm`) aos blocos condicionais (`dist_less_than`, `op_lt`, `op_gt`) no `evaluateBooleanSlot`, além de resposta de colisão elástica/deslizamento contra obstáculos e paredes.
- **Giroscópio / IMU em Tempo Real:** Conectar os blocos `hub_imu_angle`, `hub_reset_yaw`, `when_tilted` e `when_face_up` ao ângulo de guinada (*yaw*) e inclinação do robô na arena 3D.
- **Áudio Sintético (Web Audio API):** Dar feedback sonoro real aos blocos da categoria **Som** (`sound_play_until_done`, `sound_start`, `sound_set_volume`, efeitos de tom/pan).
- **Matriz de Pixels 5×5 no Hub 3D:** Renderizar os 25 LEDs da matriz configurada pelos blocos de **Luz** diretamente sobre a malha 3D do Hub SPIKE.

## 2. Desafios Educacionais e Arena
- **Modo Desafios / Missões:** Criar cenários pré-configurados (Seguidor de Linha, Labirinto, Sumô, FLL) com objetivos automáticos de validação e pontuação no Hub de Projetos.
- **Editor de Trajetos Curvos:** Permitir desenhar linhas contínuas por pontos/curvas Bézier no editor de arena para pistas de seguidor de linha mais realistas.

## 3. Compilador, `.llsp3` e Hardware Real
- **Serialização Completa de C-Blocks no `scratch.sb3`:** Expandir `spike_exporter.rs` para gerar `SUBSTACK` e `SUBSTACK2` nativos do Scratch 3 para blocos `repeat_times`, `if_then` e `if_then_else` (atualmente preservados 1:1 via `roboblocks.json`).
- **Comunicação USB Serial / BLE Nativa:** Habilitar envio direto via porta serial (`serialport`) para o LEGO SPIKE Hub físico no Linux, Windows e macOS.
- **Execução de Funções Customizadas ("Meus Blocos"):** Implementar a pilha de chamada e passagem de argumentos em tempo de simulação para blocos definidos pelo usuário via `my_block_define`.

## 4. Empacotamento e CI/CD Multiplataforma
- **GitHub Actions:** Configurar workflow automatizado usando as tasks do `.mise.toml` (`build:linux`, `build:windows`, `build:macos`, `build:macos-intel`) para publicar releases `.deb`, `.AppImage`, `.msi`/`.exe` e `.dmg` automaticamente.
