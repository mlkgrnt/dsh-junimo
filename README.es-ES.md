# dsh-junimo

[简体中文](README.md) · [繁體中文](README.zh-Hant.md) · [English](README.en-US.md) · **Español**

Un plugin de DeepSeek Harness que aporta 37 herramientas de control a *Stardew Valley*, además de las comprobaciones de despliegue y la gestión del ciclo de vida del juego que la capa MCP no puede alcanzar.

## Descripción general

Este repositorio es un **bundle de dsh**. Actúa en la capa de profile de [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

La lógica del juego no se implementa aquí. Las 37 herramientas provienen de `junimo-mcp.exe` (OCaml, archivo único) distribuido por [Junimo-MCP](https://github.com/mlkgrnt/Junimo-MCP), conectado mediante el protocolo MCP sobre stdio por el `@deepseek-ai/dsh-mcp-client` oficial y expuesto al modelo como `mcp__junimo__<herramienta>`. **Este repositorio no modifica ni una línea de Junimo-MCP.**

El plugin asume tres responsabilidades:

1. Montar el puente MCP y exponer un servicio `junimoPaths` como única fuente de verdad del ejecutable y del directorio de skills
2. Inyectar disciplina operativa de Stardew en el prompt del sistema, evitando los errores habituales de sincronización y de guardado
3. Registrar 4 herramientas nativas: diagnóstico, foco de ventana, lanzamiento del juego y carga de partida

El punto 3 no puede hacerlo ninguna herramienta MCP: el mod se ejecuta dentro del proceso del juego, así que no puede iniciar su propio proceso ni traer su propia ventana al frente.

`junimo-mcp.exe` va incluido (`bin/`, v3.2.1, 6 MB). Basta con instalar el plugin; no hay que descargar ningún binario aparte.

## Arquitectura

```
modelo ──mcp__junimo__*──▶ dsh-mcp-client ──stdio──▶ junimo-mcp.exe ──HTTP──▶ NagiBridge-Remix ──▶ juego
                                 ▲                          ▲
                          montado por dsh-junimo      reutilizado tal cual, sin modificar
                          + 4 herramientas nativas
```

| Componente | Lo aporta | Notas |
|---|---|---|
| 37 herramientas de juego | `@deepseek-ai/dsh-mcp-client` + ejecutable incluido | Percepción, movimiento, interacción, menús, tareas agrícolas, cofres, social, festivales, sustento |
| 4 herramientas nativas | Este plugin | `junimo_doctor` / `junimo_focus` / `junimo_game_launch` / `junimo_load_save` |
| Disciplina de prompt | Este plugin | Sección del prompt del sistema `junimo:rules`, unos 1000 caracteres |
| Skill incluida | `@deepseek-ai/dsh-skill-filesystem` | `skills/junimo/`, se carga bajo demanda, sin coste de contexto permanente |
| Documentación de referencia | Este plugin | `reference/game-semantics.md`, con tabla rápida de herramientas y límites conocidos |

## Requisitos

| Elemento | Requisito |
|---|---|
| Sistema operativo | Windows (el núcleo, el plugin y el mod tienen cada uno una situación distinta — ver [Plataformas compatibles](#plataformas-compatibles)) |
| dsh | `>= 0.2.1-rc.2` (declarado en `package.json`, en `dsh.engines`) |
| Juego | Stardew Valley 1.6.x |
| SMAPI | 4.x (`junimo_game_launch` lo usa para iniciar el juego) |
| Shell POSIX | bash de Git for Windows o WSL, usado para lanzar el juego. Si falta, se recurre a `cmd`: el juego arranca igual, pero aparece una ventana de consola de SMAPI adicional |
| Mod ejecutor | [NagiBridge-Remix](https://github.com/pendel001/NagiBridge-Remix), instalado en `Mods/NagiBridge/` |

Los pasos de instalación de SMAPI y del mod están en el [AGENTS.md de Junimo-MCP](https://github.com/mlkgrnt/Junimo-MCP/blob/main/AGENTS.md).

> NagiBridge-Remix se distribuye bajo PolyForm Noncommercial 1.0.0; el uso personal y no comercial es gratuito. Este proyecto no incluye su código. El NagiBridge original y Remix usan UniqueID distintos, así que tener ambos instalados hace que compitan por el puerto 7842: saca el directorio antiguo antes de cambiar.

## Instalación

```bash
# checkout local
dsh plugin --profile web add link:/path/to/dsh-junimo

# o directamente desde GitHub (ESM puro, sin paso de compilación)
dsh plugin --profile web add github:mlkgrnt/dsh-junimo
```

`dsh plugin add` inicializa el profile y añade este paquete a `dsh.profile.bundles`. Surte efecto tras reiniciar dsh.

Tras instalar, ejecuta `junimo_doctor` para comprobar toda la cadena. Informa la ruta y la versión del ejecutable, el estado del puerto 7842, la respuesta del mod, la disponibilidad de la partida, la integridad de los archivos de SMAPI y NagiBridge, y las líneas de error del log de SMAPI.

> Si al instalar desde GitHub te avisa de que un script de compilación no está autorizado, añade la clave de paquete que te indique pnpm a `allowBuilds` en el `pnpm-workspace.yaml` del profile. Este paquete no tiene paso de compilación, así que rara vez ocurre.

## Configuración

### Variables de entorno

| Variable | Valor por defecto | Función |
|---|---|---|
| `JUNIMO_MCP_BIN` | `bin/junimo-mcp.exe` incluido | Sustituye el ejecutable incluido; útil para actualizar, revertir o usar un binario propio |
| `STARDEW_GAME_DIR` | detección automática | Directorio que contiene `Stardew Valley.exe`; si no se define, se prueban las bibliotecas de Steam y las rutas habituales |
| `STARDEW_API_URL` | `http://localhost:7842` | Endpoint del mod. Debe ser `localhost`; el sistema rechaza `127.0.0.1` |
| `STARDEW_AUTO_MENU` | `1` | Se pasa al ejecutable: responde automáticamente a diálogos sin opciones |
| `STARDEW_AUTO_EVENT` | sin definir | Se pasa al ejecutable: omite automáticamente eventos de la historia, desactivado por defecto |

El resto de variables del ejecutable (`STARDEW_HTTP`, `STARDEW_SETTLE`, etc.) están documentadas en el README de Junimo-MCP y también se pueden pasar mediante `env` en `cordis.patch.yml`.

### Sobrescribir los valores del plugin

El `cordis.patch.yml` de un profile sobrescribe las filas del plugin por `id`. Un patch reemplaza `config` por completo, así que hay que repetir todas las claves:

```yaml
- insert:
    - id: junimo-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      inject: [junimoPaths]
      config:
        serverName: junimo
        transport: stdio
        command: 'D:\tools\junimo-mcp.exe'
        args: []
        env: { STARDEW_API_URL: 'http://localhost:7842' }
        cwd: 'D:\tools'
        toolCallTimeoutMs: 180000
        failOnStartupError: true
```

## Herramientas

### Herramientas nativas

| Herramienta | Función |
|---|---|
| `junimo_doctor` | Diagnóstico de la cadena. Solo lectura, no repara nada. Conviene llamarla antes de tocar el juego |
| `junimo_focus` | Trae la ventana del juego al frente. SDV se pausa al perder el foco, y con el juego pausado los clics y las operaciones de menú no hacen nada |
| `junimo_game_launch` | Inicia el juego mediante `StardewModdingAPI.exe` y espera respuesta en el 7842; no hace nada si ya está en marcha. SMAPI es un programa de consola y se cierra al instante si se lanza directamente, así que se inicia primero a través de bash y solo se recurre a `cmd` si no hay bash |
| `junimo_load_save` | Enfoca la ventana → pulsa Load → pulsa la ranura → sondea hasta `worldReady`; reintenta la ronda completa si falla |

Lo difícil de `junimo_load_save` es el momento, no las coordenadas. `TitleMenu.receiveLeftClick` descarta clics en silencio durante los fundidos y las transiciones, así que la implementación es «esperar a que la interfaz se estabilice → pulsar → decidir con `worldReady` → reintentar la ronda completa». Las coordenadas corresponden a la pantalla de título en modo ventana a 1280×720.

### Herramientas puenteadas

La lista completa de las 37 herramientas `mcp__junimo__*`, con argumentos y advertencias, está en [`reference/game-semantics.md`](./reference/game-semantics.md).

Entre ellas, `choose` de `story` es de dos fases dentro de `junimo-mcp.exe`: la ruta por defecto registra primero la respuesta en el juego y, si la pantalla no avanza, envía automáticamente un clic real de seguimiento. Verificado en partida real (evento de adopción de mascota): tras elegir, el evento avanzó a la escena siguiente. Quien llama no necesita, y no debe, enviar un segundo clic.

## Mantenimiento

### Sincronizar el ejecutable incluido

```bash
node scripts/sync-binary.mjs          # toma la última release de Junimo-MCP
node scripts/sync-binary.mjs v3.2.1   # o fija un tag concreto
```

El script descarga el ejecutable y el SHA-256 oficial, los verifica localmente y solo entonces sobrescribe `bin/`, actualizando a la vez `bin/BUNDLED_VERSION`. Después hay que hacer `git add bin/` y commit.

La versión incluida actualmente está en `bin/BUNDLED_VERSION`.

## Desarrollo

### Estructura

```
src/index.js    Entrada del plugin: servicio junimoPaths, sección de prompt, registro de las 4 herramientas
src/paths.js    Resolución y sondeo del ejecutable / directorio del juego / recursos del paquete
src/api.js      Cliente HTTP mínimo para NagiBridge (comprobación y apoyos de sincronización)
src/doctor.js   Comprobaciones y renderizado de junimo_doctor
src/game.js     Foco, lanzamiento, carga de partida
skills/         Skill incluida
reference/      Documentos largos que se leen bajo demanda
scripts/        Scripts de mantenimiento
test/           Scripts de humo y de verificación en máquina real
```

El código es ESM JavaScript puro, sin paso de compilación: `src/*.js` es el artefacto publicado.

### Pruebas

```bash
node test/smoke.mjs                    # humo sin conexión, no necesita el juego ni un host dsh
node test/verify-load-save.mjs         # máquina real: lanza el juego, carga partida, verifica worldReady
node test/verify-load-save.mjs --existing   # si el juego ya está abierto, solo verifica la carga
```

La prueba de humo sin conexión verifica el servicio `junimoPaths`, la sección de prompt, el registro de las 4 herramientas y ejecuta `junimo_doctor` una vez. Depende de un stub local de `node_modules/@deepseek-ai/dsh-tools` para poder ejecutarse con Node directamente; en un despliegue real ese paquete lo aporta el host de dsh.

### Verificación dentro de dsh

```bash
dsh plugin --profile <name> add link:/path/to/dsh-junimo
dsh --profile <name> --dump-config | grep -A8 junimo   # confirma que las tres capas entraron en el bundle
dsh --profile <name> --no-open                          # arranca; "entries did not activate" indica un problema
```

## Plataformas compatibles

El plugin hoy **solo funciona en Windows**, pero las razones se reparten en tres capas en lugar de ser un bloque macizo. Distinguirlas importa a la hora de estimar el esfuerzo de portarlo:

| Capa | Situación | Evidencia |
|---|---|---|
| Núcleo OCaml (lo que contiene `junimo-mcp.exe`) | **Multiplataforma, con artefactos publicados para macOS / Linux** | Sus dependencias son solo `yojson` + `unix` y el código no tiene ramas por plataforma; CI supera todas las aserciones sin juego en runners Linux / macOS / Windows; cada artefacto se vuelve a probar en su plataforma antes de publicarse |
| Este plugin (lanzamiento de procesos, foco de ventana, sondeo de rutas) | **Solo Windows** | El foco usa user32, el lanzamiento pasa por PowerShell y bash, y las bibliotecas de Steam se buscan por letra de unidad |
| Mod ejecutor (NagiBridge-Remix) | **Parcialmente solo Windows** | `/press_key` y `/click_tile` usan `keybd_event` / `mouse_event`; `/click` usa llamadas en proceso cuando hay un menú abierto o se pasa `no_mouse`, y de por sí es portable |

El plugin incluye solo el `junimo-mcp.exe` de Windows. Quien use macOS o Linux puede bajar el artefacto correspondiente de [Junimo-MCP Releases](https://github.com/mlkgrnt/Junimo-MCP/releases/latest) (`junimo-mcp-macos-arm64` / `junimo-mcp-linux-x86_64`) y apuntar `JUNIMO_MCP_BIN` hacia él: eso cubre la mayoría de las 37 herramientas. En sistemas que no son Windows, `junimo_doctor` muestra la URL de descarga de esa plataforma en lugar de un vago «no se encuentra el ejecutable».

Las herramientas **propias del plugin** `junimo_focus` / `junimo_game_launch` / `junimo_load_save` siguen siendo solo para Windows: son la razón de existir del plugin, y usarlas en otra plataforma implica añadir tú mismo la capa correspondiente (foco con `osascript` / `xdotool`, sondeo de rutas con el directorio de Steam de cada sistema). Ahí está el límite del port.

## Limitaciones conocidas

- **El plugin hoy solo funciona en Windows.** El foco de ventana, el lanzamiento de procesos y la carga de partida dependen de PowerShell y user32. Pero **Junimo-MCP ya ofrece binarios para macOS / Linux**, que puedes descargar y usar, o portar las tres herramientas del plugin según necesites.
- **Las coordenadas de carga asumen la pantalla de título a 1280×720.** Verificado en máquina real en modo ventana; otras resoluciones requieren recalcularlas, ver los comentarios de `src/game.js`.
- **El `junimo-mcp.exe` incluido es un artefacto de release de Junimo-MCP** (MIT). Este proyecto no incluye NagiBridge-Remix.

## Licencia

MIT, ver [LICENSE](./LICENSE). El `junimo-mcp.exe` incluido y NagiBridge-Remix siguen cada uno su propia licencia.
