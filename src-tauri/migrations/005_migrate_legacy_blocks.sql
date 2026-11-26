-- 8. Atualiza registros legados no banco para respeitar a nova estrutura de blocos, definições e 3D

UPDATE canvas_states
SET definitions_json = '{"variables":[],"lists":[],"messages":["Mensagem 1"],"customBlocks":[]}'
WHERE definitions_json IS NULL OR definitions_json = '' OR definitions_json = '{}';

UPDATE robot_configs
SET visual_json = '{"chassisColor":"#facc15","accentColor":"#1e293b","wheelColor":"#111827","lengthMm":175,"widthMm":135,"heightMm":95,"hasColorSensor":true,"hasDistanceSensor":true,"colorSensorSide":"front","distanceSensorSide":"front"}'
WHERE visual_json IS NULL OR visual_json = '' OR visual_json = '{}';

UPDATE blocks
SET category = 'light'
WHERE opcode = 'set_rgb_color' AND category = 'events';

UPDATE blocks
SET category = 'motors', opcode = 'motor_run_for'
WHERE opcode = 'motor_run_rotations';
