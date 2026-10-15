# 📱 Voxel Realms — Proyecto Android Studio APK

Este proyecto contiene la aplicación Android nativa completa configurada para empaquetar y ejecutar **Voxel Realms** en cualquier teléfono o tablet Android con aceleración de hardware WebGL, multijugador en tiempo real por WebSockets y controles táctiles de pantalla completa.

---

## 🚀 Cómo abrir y generar el APK en Android Studio

1. **Abre Android Studio** en tu PC (`C:\Program Files\Android\Android Studio`).
2. En la pantalla de bienvenida, selecciona **Open** (o **File > Open...**).
3. Navega y selecciona la carpeta:
   ```
   c:\Users\workai\Music\MINECRAFT ONRDER\android
   ```
4. Espera a que Android Studio realice la sincronización inicial de Gradle automáticamente (ya está preconfigurado con el SDK de tu equipo: `C:\Users\workai\AppData\Local\Android\Sdk`).

### 📦 Generar el archivo APK:
- En la barra de menú superior de Android Studio, ve a:
  **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
- Cuando termine (suele tardar menos de 1 minuto), aparecerá una notificación abajo a la derecha:
  *"APK(s) generated successfully for 1 module"*.
- Haz clic en **locate** para abrir la carpeta donde se encuentra tu archivo `.apk`:
  `android/app/build/outputs/apk/debug/app-debug.apk`.
- ¡Copia ese archivo `.apk` a tu teléfono móvil e instálalo para jugar directamente!

### 📲 Probar directamente en tu móvil o emulador:
1. Conecta tu teléfono Android por cable USB con la **Depuración por USB** activada (o abre un Emulador en Android Studio).
2. Haz clic en el botón verde **Run (▶)** en la barra de herramientas superior.
3. El juego se instalará y abrirá automáticamente en modo apaisado (landscape) a pantalla completa inmersiva.

---

## 🌐 Configuración del Servidor Online

Por defecto, la APK está conectada al servidor público de Render:
```java
https://voxel-realms.onrender.com
```

Si deseas conectarlo a tu servidor local de pruebas en tu misma red Wi-Fi:
- Abre `android/app/src/main/res/values/strings.xml` y cambia `server_url` por la IP local de tu PC (por ejemplo `http://192.168.1.XX:3000`).

---

## ✨ Características de la versión Android:
- **Pantalla Completa Inmersiva (`IMMERSIVE_STICKY`)**: Oculta la barra de notificaciones y la barra de navegación del sistema para aprovechar el 100% de la pantalla del móvil.
- **Aceleración por Hardware WebGL**: 60 FPS fluidos con shaders PBR y texturas procedurales.
- **Joystick Virtual Táctil Ergonomizado**: En la esquina inferior izquierda para desplazarte libremente.
- **Botones de Acción Traslúcidos (*Frosted Glass*)**: `⛏️ Romper`, `🧱 Colocar` y `🦘 Saltar` diseñados para no tapar la vista.
- **Menú de Juego Completo (`⚙️`)**: Acceso directo al Mapa de Viaje Rápido, Modos de Velocidad (1x, 2.5x, 5x Vuelo), Cambio de Cámara (1ª y 3ª persona), Compartir Ubicación y Catálogo de Bloques.
