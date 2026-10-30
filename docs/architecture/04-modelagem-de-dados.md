# 4. Modelagem de Dados & Diagrama de Classes

> [📚 Índice](README.md) · [← 3. Casos de Uso](03-casos-de-uso.md) · [5. Diagramas de Estados →](05-diagramas-de-estados.md)

## 4.1 Modelo de Domínio (Diagrama de Classes)

```mermaid
classDiagram
    direction LR

    class Project {
        +Uuid id
        +String name
        +String description
        +Option~String~ templateId
        +i32 schemaVersion
        +i64 revision
        +DateTime createdAt
        +DateTime updatedAt
        +rename(name)
        +activeCanvas() CanvasState
        +activeEnvironment() SimulationEnvironment
    }

    class CanvasState {
        +Uuid id
        +String name
        +Viewport viewport
        +i64 revision
        +topLevelBlocks() List~Block~
        +apply(op: CanvasOp) Result
        +toBlockGraph() BlockGraph
    }

    class Viewport {
        +f64 scrollX
        +f64 scrollY
        +f64 zoom
    }

    class Block {
        +Uuid id
        +String opcode
        +BlockShape shape
        +Option~Uuid~ parentId
        +Option~Uuid~ nextId
        +Option~String~ parentInput
        +Point position
        +bool isShadow
        +bool collapsed
        +Map~String, Field~ fields
        +Map~String, Input~ inputs
        +isTopLevel() bool
        +canConnect(target: Connection) bool
    }

    class Input {
        +String name
        +InputKind kind
        +Option~Uuid~ blockId
        +Option~Uuid~ shadowId
    }

    class Field {
        +String name
        +FieldValue value
    }

    class BlockDefinition {
        +String opcode
        +BlockCategory category
        +BlockShape shape
        +List~InputSpec~ inputs
        +List~FieldSpec~ fields
        +Option~ValueType~ outputType
        +String i18nKey
    }

    class BlockShape {
        <<enumeration>>
        HAT
        STACK
        C_BLOCK
        CAP
        REPORTER
        BOOLEAN
    }

    class BlockCategory {
        <<enumeration>>
        MOTION
        MOTORS
        SENSORS
        CONTROL
        OPERATORS
        VARIABLES
        EVENTS
        MY_BLOCKS
    }

    class Variable {
        +Uuid id
        +String name
        +ValueType type
        +FieldValue initialValue
        +VarScope scope
    }

    class RobotConfig {
        +Uuid id
        +String name
        +RobotModel model
        +f32 wheelDiameterMm
        +f32 axleTrackMm
        +f32 massG
        +Port leftDrivePort
        +Port rightDrivePort
        +portFor(role) Option~PortAssignment~
        +validate() List~Diagnostic~
    }

    class PortAssignment {
        +Port port
        +DeviceType device
        +bool reversed
        +Json params
    }

    class DeviceType {
        <<enumeration>>
        MOTOR_LARGE
        MOTOR_MEDIUM
        COLOR_SENSOR
        DISTANCE_SENSOR
        FORCE_SENSOR
    }

    class SimulationEnvironment {
        +Uuid id
        +String name
        +Dimension dimension
        +Size2 arenaSizeMm
        +f32 gravity
        +f32 floorFriction
        +Option~String~ matTexture
        +Pose spawnPose
        +addObject(obj)
        +removeObject(id)
    }

    class EnvironmentObject {
        +Uuid id
        +ObjectKind kind
        +Transform transform
        +Vec3 size
        +Color color
        +bool isStatic
        +f32 friction
        +Json metadata
    }

    class ObjectKind {
        <<enumeration>>
        WALL
        BOX_OBSTACLE
        CYLINDER
        LINE_PATH
        COLOR_ZONE
        GOAL_AREA
    }

    class Pose {
        +f32 x
        +f32 y
        +f32 z
        +f32 headingDeg
    }

    Project "1" *-- "1..*" CanvasState : contém
    Project "1" *-- "0..*" Variable : declara
    Project "1" *-- "1" RobotConfig : usa
    Project "1" *-- "1..*" SimulationEnvironment : possui
    CanvasState "1" *-- "1" Viewport
    CanvasState "1" *-- "0..*" Block : contém
    Block "1" *-- "0..*" Input
    Block "1" *-- "0..*" Field
    Block "0..1" --> "0..1" Block : next
    Input "1" --> "0..1" Block : encaixe
    Block ..> BlockDefinition : instância de
    BlockDefinition --> BlockShape
    BlockDefinition --> BlockCategory
    RobotConfig "1" *-- "0..6" PortAssignment : portas A-F
    PortAssignment --> DeviceType
    SimulationEnvironment "1" *-- "0..*" EnvironmentObject
    SimulationEnvironment --> Pose : spawn
    EnvironmentObject --> ObjectKind
```

> [!NOTE]
> **Representação hierárquica dos blocos (modelo Scratch/Spike):** a árvore usa duas relações.
> - **`next`** forma a *pilha* vertical (sequência de comandos).
> - **`parent` + `parentInput`** encaixam um bloco num *slot*: um reporter dentro de um input numérico, ou o corpo de um C-block (input `SUBSTACK`).
>
> Um bloco é **top-level** quando `parentId == null`. Um script é um bloco top-level do tipo `HAT` mais toda a cadeia `next` dele.

## 4.2 Modelo de Execução (Compilador / VM / Simulação)

```mermaid
classDiagram
    direction LR

    class CompileService {
        +compile(graph: BlockGraph, robot: RobotConfig) CompileResult
        +generatePython(graph) String
    }
    class Program {
        +String hash
        +List~ScriptCode~ scripts
        +Map~Uuid, VarSlot~ variables
    }
    class ScriptCode {
        +Uuid hatBlockId
        +Trigger trigger
        +List~Instruction~ code
    }
    class Instruction {
        +OpCode op
        +List~Operand~ args
        +Uuid blockId
    }
    class Diagnostic {
        +Uuid blockId
        +Severity severity
        +String messageKey
    }

    class SimulationSession {
        +Uuid id
        +SimState state
        +f32 speed
        +u64 tick
        +play()
        +pause()
        +step(mode: StepMode)
        +reset()
        +stop()
    }
    class Vm {
        +List~VmThread~ threads
        +Scheduler scheduler
        +runSlice(budget, hal) VmStatus
        +stepInstruction(hal) VmStatus
    }
    class VmThread {
        +u32 pc
        +Stack~Value~ stack
        +ThreadStatus status
        +Option~WaitCondition~ waiting
    }
    class Hal {
        <<interface>>
        +setMotor(port, speed)
        +readColor(port) Color
        +readDistance(port) f32
        +readYaw() f32
        +now() Duration
    }
    class World {
        +PhysicsBackend physics
        +VirtualRobot robot
        +fixedStep(dt)
        +snapshot() SimFrame
    }
    class VirtualRobot {
        +Pose pose
        +List~SimMotor~ motors
        +List~SimSensor~ sensors
    }
    class SimFrame {
        +u64 tick
        +Pose robotPose
        +Map~Port, SensorReading~ sensors
        +List~Uuid~ activeBlocks
        +List~LogLine~ logs
    }

    CompileService ..> Program : gera
    CompileService ..> Diagnostic : emite
    Program *-- ScriptCode
    ScriptCode *-- Instruction
    SimulationSession *-- Vm
    SimulationSession *-- World
    Vm *-- VmThread
    Vm ..> Hal : usa
    World *-- VirtualRobot
    World ..|> Hal : SimHal
    SimulationSession ..> SimFrame : publica via Channel
```

## 4.3 Modelo Relacional (SQLite)

**`hub.db`** (global, em `app_data_dir`):

```mermaid
erDiagram
    HUB_PROJECTS {
        TEXT id PK "uuid"
        TEXT name
        TEXT file_path "UNIQUE, caminho absoluto do .robo"
        TEXT robot_model
        TEXT dimension "2D ou 3D"
        BLOB thumbnail "PNG pequeno"
        INTEGER favorite
        TEXT last_opened_at
        TEXT created_at
    }
    TEMPLATES {
        TEXT id PK
        TEXT name
        TEXT category "builtin, educador"
        TEXT file_path
        TEXT description
    }
    APP_SETTINGS {
        TEXT key PK
        TEXT value "JSON"
    }
    USER_PROGRESS {
        TEXT challenge_id PK
        INTEGER stars
        TEXT completed_at
    }
```

**`<projeto>.robo`** (um SQLite por projeto):

```mermaid
erDiagram
    PROJECT ||--|{ CANVAS_STATES : contem
    PROJECT ||--o{ VARIABLES : declara
    PROJECT ||--|| ROBOT_CONFIGS : usa
    PROJECT ||--|{ ENVIRONMENTS : possui
    PROJECT ||--o{ PROJECT_SNAPSHOTS : versiona
    PROJECT ||--o{ SIMULATION_RUNS : registra
    CANVAS_STATES ||--o{ BLOCKS : contem
    BLOCKS ||--o{ BLOCKS : "parent (slot)"
    BLOCKS |o--o| BLOCKS : "next (pilha)"
    ROBOT_CONFIGS ||--o{ ROBOT_PORTS : configura
    ENVIRONMENTS ||--o{ ENVIRONMENT_OBJECTS : contem

    PROJECT {
        TEXT id PK
        TEXT name
        TEXT description
        TEXT template_id
        INTEGER schema_version
        INTEGER revision
        TEXT active_canvas_id FK
        TEXT active_environment_id FK
        TEXT layout_json "estado dos docks"
        TEXT created_at
        TEXT updated_at
    }
    CANVAS_STATES {
        TEXT id PK
        TEXT project_id FK
        TEXT name
        REAL scroll_x
        REAL scroll_y
        REAL zoom
        INTEGER revision
    }
    BLOCKS {
        TEXT id PK
        TEXT canvas_id FK
        TEXT opcode
        TEXT parent_id FK "NULL = top-level"
        TEXT parent_input "ex: CONDITION, SUBSTACK"
        TEXT next_id FK "UNIQUE"
        REAL x "apenas top-level"
        REAL y
        TEXT fields_json
        INTEGER is_shadow
        INTEGER collapsed
        TEXT comment
    }
    VARIABLES {
        TEXT id PK
        TEXT project_id FK
        TEXT name "UNIQUE por projeto"
        TEXT value_type "number, string, bool, list"
        TEXT initial_value
    }
    ROBOT_CONFIGS {
        TEXT id PK
        TEXT project_id FK
        TEXT model "SPIKE_PRIME, SPIKE_ESSENTIAL, CUSTOM"
        REAL wheel_diameter_mm
        REAL axle_track_mm
        REAL mass_g
        TEXT left_drive_port
        TEXT right_drive_port
        TEXT mesh_asset
    }
    ROBOT_PORTS {
        TEXT robot_config_id PK, FK
        TEXT port PK "A a F"
        TEXT device_type
        INTEGER reversed
        TEXT params_json "offset, FOV do sensor"
    }
    ENVIRONMENTS {
        TEXT id PK
        TEXT project_id FK
        TEXT name
        TEXT dimension "2D ou 3D"
        REAL width_mm
        REAL depth_mm
        REAL gravity
        REAL floor_friction
        TEXT mat_texture
        REAL spawn_x
        REAL spawn_y
        REAL spawn_heading
    }
    ENVIRONMENT_OBJECTS {
        TEXT id PK
        TEXT environment_id FK
        TEXT kind
        TEXT transform_json "pos, rot, scale"
        TEXT size_json
        TEXT color
        INTEGER is_static
        TEXT metadata_json
    }
    PROJECT_SNAPSHOTS {
        INTEGER id PK
        TEXT project_id FK
        INTEGER revision
        TEXT reason "autosave, pre-run, manual"
        BLOB payload_zstd "JSON completo comprimido"
        TEXT created_at
    }
    SIMULATION_RUNS {
        INTEGER id PK
        TEXT environment_id FK
        INTEGER revision
        TEXT result "completed, error, stopped"
        INTEGER duration_ms
        TEXT metrics_json "distancia, colisoes, objetivo"
        TEXT created_at
    }
```

**Notas de implementação SQL:**
```sql
PRAGMA journal_mode = WAL;        -- leituras concorrentes + escrita sem bloquear a UI
PRAGMA foreign_keys = ON;
CREATE UNIQUE INDEX ux_blocks_next   ON blocks(next_id) WHERE next_id IS NOT NULL;
CREATE UNIQUE INDEX ux_blocks_slot   ON blocks(parent_id, parent_input) WHERE parent_id IS NOT NULL;
CREATE INDEX ix_blocks_canvas_top    ON blocks(canvas_id) WHERE parent_id IS NULL;
```
- Os dois índices únicos **garantem a integridade estrutural** do grafo: um bloco tem no máximo um sucessor, e cada slot recebe só um bloco.
- **A detecção de ciclos** (um bloco encaixado em si mesmo) fica no domínio (`CanvasState::apply`) antes de persistir.
- `fields_json` guarda valores literais (ex.: `{"DIRECTION":"forward","UNIT":"cm"}`), e cada bloco com valor em input ganha um bloco *shadow* (igual ao Scratch).

---

[📚 Índice](README.md) · [← 3. Casos de Uso](03-casos-de-uso.md) · [5. Diagramas de Estados →](05-diagramas-de-estados.md)
