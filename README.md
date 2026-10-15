# VOXEL REALMS — Juego 3D Multijugador Hiperrealista para Navegador

**VOXEL REALMS** es un videojuego de exploración y construcción voxel en 3D para navegador web, diseñado con gráficos PBR hiperrealistas, simulación física continua y multijugador en tiempo real mediante WebSockets.

---

## 🌟 Características Principales

1. **Juego Directo en el Navegador**:
   - Desarrollado con Three.js, WebGL y JavaScript moderno (ES Modules).
   - No requiere descargar ejecutables, emuladores ni extensiones.
2. **Estilo Visual Hiperrealista (PBR)**:
   - Texturas procedurales en alta resolución (256x256 por cara) con mapas de color, mapas de normales (filtro Sobel) y mapas de rugosidad.
   - Materiales especializados para césped, tierra fértil, roca/granito, madera con vetas, corteza de roble, hojas translúcidas, agua dinámica con ondulación, nieve, cristal, ladrillo, arcilla, hierro y oro.
   - Ciclo continuo de día y noche sincronizado entre todos los jugadores: sol dinámico, luna, luz ambiental atmosférica, niebla con dispersión cromática y sombras suaves PCF.
3. **Mundo Voxel Infinito y Generación Procedural**:
   - Terreno determinista generado mediante ruido simplex fractal (fBm) por semilla (`WORLD_SEED`).
   - Biomas: llanuras, bosques frondosos con árboles volumétricos, montañas nevadas y costas arenosas con masas de agua.
   - Chunks (16x16x64) con algoritmo de eliminación de caras ocultas (face-culling) y oclusión ambiental en los vértices (Voxel AO).
4. **Multijugador Real en Tiempo Real**:
   - Conexiones WebSocket concurrentes servidas desde el mismo origen HTTP.
   - Avatares 3D con articulaciones animadas (caminar, correr, saltar, nadar).
   - Interpolación de movimiento suave (lerp) para evitar saltos.
   - Placas de nombre 3D sobre cada jugador.
   - Registro de chat en vivo y notificaciones de entrada/salida.
5. **Construcción y Destrucción Dinámica**:
   - Raycasting voxel ultrarrápido (algoritmo DDA) para apuntar bloques y detectar la cara de colocación.
   - Actualización local optimista inmediata y confirmación autoritativa en el servidor.
   - Partículas de fragmentación 3D impulsadas por gravedad al destruir bloques.
   - Prevención de atrapamiento: no se permite colocar bloques dentro del personaje.
6. **Optimización Extrema**:
   - Atlas de texturas empaquetado para reducir draw calls al mínimo.
   - Sistema de colas de remallado que no bloquea el hilo principal (mantiene 60 FPS estables).
   - Tres perfiles gráficos seleccionables: *Equilibrado*, *Alto* y *Ultra*.

---

## 🛠️ Tecnologías Empleadas

- **Frontend**: HTML5, CSS3, JavaScript ES6+, Three.js (r160 vía CDN importmap), WebGL, Pointer Lock API.
- **Backend**: Node.js, Express, `ws` (WebSockets), arquitectura modular autoritativa.
- **Física**: Motor cinemático propio de colisiones voxel Swept-AABB con gravedad, amortiguamiento y flotación en agua.
- **Despliegue**: Configuración `render.yaml` lista para despliegue automático gratuito en Render.

---

## 🚀 Instalación y Ejecución Local

### Prerrequisitos
- Node.js versión 18 o superior instalada.

### Pasos:
1. Abre una terminal en la carpeta del proyecto:
   ```bash
   cd "c:\Users\workai\Music\MINECRAFT ONRDER"
   ```
2. Instala las dependencias del servidor:
   ```bash
   npm install
   ```
3. Ejecuta el servidor:
   ```bash
   npm start
   ```
4. Abre tu navegador web en:
   ```
   http://localhost:3000
   ```

---

## 👥 Prueba del Multijugador (Dos Navegadores)

Para verificar que el multijugador funciona en tiempo real:

1. Abre una ventana de tu navegador (ej. Chrome) en `http://localhost:3000`.
   - Escribe el nombre `Jugador_1` y pulsa **ENTRAR AL MUNDO**.
2. Abre una **segunda ventana en modo incógnito** o en otro navegador (ej. Edge o Firefox) en `http://localhost:3000`.
   - Escribe el nombre `Jugador_2` y pulsa **ENTRAR AL MUNDO**.
3. **Observarás inmediatamente**:
   - El anuncio en el chat: *"Jugador_2 se ha unido al reino"*.
   - El avatar 3D de `Jugador_2` visible en el mundo con su nombre encima.
   - Al moverte en una ventana, verás al avatar caminar y rotar suavemente en la otra.
   - Si `Jugador_1` rompe o coloca un bloque con el ratón, el cambio y las partículas se replican al instante en la pantalla de `Jugador_2`.

---

## 🎮 Controles del Juego

| Tecla / Control | Acción |
| :--- | :--- |
| **W, A, S, D** | Moverse en primera persona |
| **Ratón** | Mirar alrededor |
| **Espacio** | Saltar / Nadar en agua |
| **Shift** | Correr (sprint) |
| **Clic Izquierdo** | Destruir bloque objetivo |
| **Clic Derecho** | Colocar bloque seleccionado |
| **1 al 9** / Rueda | Seleccionar bloque de la barra rápida |
| **E** | Abrir catálogo de bloques / inventario |
| **T** o **Enter** | Abrir chat multijugador |
| **Tab** | Ver lista de exploradores conectados |
| **Escape** | Menú de pausa y configuración gráfica |

---

## 🌐 Guía de Subida a GitHub y Despliegue en Render

El usuario proporcionó el correo de Render: `gerpejun@gmail.com`. A continuación se detallan los pasos exactos para subir el código a GitHub y desplegarlo en Render:

### Paso 1: Subir el proyecto a GitHub

1. **Crear una cuenta en GitHub (si aún no la tienes)**:
   - Entra en [github.com/signup](https://github.com/signup) y utiliza tu correo `gerpejun@gmail.com`.
2. **Crear un nuevo repositorio**:
   - Ve a [github.com/new](https://github.com/new).
   - Nombre del repositorio: `voxel-realms`.
   - Marca la casilla **Public** (Público).
   - Haz clic en **Create repository**.
3. **Subir los archivos locales desde tu terminal**:
   ```bash
   cd "c:\Users\workai\Music\MINECRAFT ONRDER"
   git init
   git add .
   git commit -m "Initial release: Voxel Realms 3D Multiplayer"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO_GITHUB/voxel-realms.git
   git push -u origin main
   ```

---

### Paso 2: Desplegar en Render (Gratis)

1. **Iniciar sesión en Render**:
   - Entra en [dashboard.render.com](https://dashboard.render.com/).
   - Inicia sesión con tu correo `gerpejun@gmail.com` o vincula tu cuenta de GitHub recién creada.
2. **Crear un nuevo Web Service**:
   - Pulsa el botón azul **New +** y selecciona **Web Service**.
   - Conecta tu cuenta de GitHub y elige el repositorio `voxel-realms`.
3. **Configuración del servicio**:
   - **Name**: `voxel-realms`
   - **Environment / Runtime**: `Node`
   - **Region**: Frankfurt (o la más cercana a ti)
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free` ($0/mes)
4. **Variables de Entorno (Environment Variables)**:
   - Render asigna automáticamente el puerto en `process.env.PORT` (el servidor ya está programado para escucharlo en `0.0.0.0`).
   - Puedes configurar opcionalmente:
     - `NODE_ENV`: `production`
     - `MAX_PLAYERS`: `12`
     - `WORLD_SEED`: `48151623`
5. **Completar Despliegue**:
   - Haz clic en **Create Web Service**.
   - Render clonará el repositorio, ejecutará `npm install` y arrancará `node server.js`.
   - En 1-2 minutos tendrás tu enlace público del tipo: `https://voxel-realms-xxxx.onrender.com`.

---

## ⚡ Consideraciones del Plan Gratuito de Render

- **Suspensión por inactividad**: El plan gratuito de Render suspende los contenedores tras 15 minutos sin peticiones HTTP. Cuando alguien vuelve a abrir el enlace, el servidor tarda aproximadamente 30-45 segundos en reanudar la actividad (arranque en frío).
- **Keepalive de WebSockets**: Mientras haya jugadores dentro del juego, el sistema de latidos periódicos (`heartbeat` ping/pong cada 30 segundos) mantendrá la conexión WebSocket activa e impedirá que el servicio se duerma.
- **Ruta de verificación de salud**: Render utiliza la ruta `/healthz` configurada en el servidor para comprobar el estado de salud de la aplicación.
- **Persistencia**: La versión actual almacena todas las modificaciones del mundo (bloques destruidos y colocados) en memoria delta sincronizada con la semilla procedural. Si el servidor de Render se reinicia, el mundo vuelve a su estado inicial. Para persistencia permanente entre reinicios, se puede acoplar fácilmente una base de datos externa gratuita (ej. MongoDB Atlas o Redis).
