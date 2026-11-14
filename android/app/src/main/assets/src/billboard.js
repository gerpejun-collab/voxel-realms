// public/src/billboard.js
// Giant Billboard / Pantalla de Anuncios Manager
// Renders colossal 3D LED advertising screens in the world with dynamic canvas textures,
// displaying user-uploaded photos with cyclic transitions or animated futuristic neon ads.
import * as THREE from 'three';

export class BillboardManager {
  constructor(scene, world = null) {
    this.scene = scene;
    this.world = world;
    this.billboards = new Map(); // id -> billboard object
    this.localPhotos = this.loadStoredPhotos();
    this.defaultAdPhase = 0;
  }

  loadStoredPhotos() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('voxel_billboard_photos');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (_) {}
    return [];
  }

  saveStoredPhotos(photos) {
    this.localPhotos = Array.isArray(photos) ? photos : [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('voxel_billboard_photos', JSON.stringify(this.localPhotos));
      }
    } catch (_) {}
    // Update existing billboards that use local photos
    for (const b of this.billboards.values()) {
      if (!b.fromNetwork || (b.photos && b.photos.length === 0)) {
        b.photos = [...this.localPhotos];
        b.currentPhotoIndex = 0;
        this.preloadBillboardImages(b);
        this.renderBillboard(b);
      }
    }
  }

  preloadBillboardImages(billboard) {
    billboard.loadedImages = [];
    if (!Array.isArray(billboard.photos) || billboard.photos.length === 0) return;

    for (let i = 0; i < billboard.photos.length; i++) {
      const src = billboard.photos[i];
      if (!src || typeof src !== 'string') continue;
      if (typeof Image === 'undefined') continue;
      const img = new Image();
      img.onload = () => {
        billboard.loadedImages[i] = img;
        this.renderBillboard(billboard);
      };
      img.onerror = () => {
        billboard.loadedImages[i] = null;
      };
      img.src = src;
    }
  }

  createBillboard(data, fromNetwork = false) {
    if (!data || typeof data.x !== 'number') return null;
    const id = data.id || `billboard_${Math.round(data.x)}_${Math.round(data.y)}_${Math.round(data.z)}`;

    // If already exists, update photos
    if (this.billboards.has(id)) {
      const existing = this.billboards.get(id);
      if (Array.isArray(data.photos) && data.photos.length > 0) {
        existing.photos = [...data.photos];
        existing.currentPhotoIndex = 0;
        this.preloadBillboardImages(existing);
        this.renderBillboard(existing);
      }
      return existing;
    }

    const rot = ((Number(data.rotation || 0) % 4) + 4) % 4;
    const photos = (Array.isArray(data.photos) && data.photos.length > 0)
      ? [...data.photos]
      : [...this.localPhotos];

    // Screen dimensions: 13.0m wide x 5.0m high (centered around y + 8)
    const screenWidth = 13.0;
    const screenHeight = 5.0;

    let cx = data.x;
    let cz = data.z;
    let normalYaw = 0;

    // Orientation of billboard screen plane facing outwards
    if (rot === 0) {
      cz -= 0.52;
      normalYaw = 0;
    } else if (rot === 1) {
      cx += 0.52;
      normalYaw = Math.PI / 2;
    } else if (rot === 2) {
      cz += 0.52;
      normalYaw = Math.PI;
    } else if (rot === 3) {
      cx -= 0.52;
      normalYaw = -Math.PI / 2;
    }

    let canvas = null;
    let ctx = null;
    let texture = null;
    let mesh = null;

    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      ctx = canvas.getContext('2d');
      texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const geometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
      });

      mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx, Number(data.y) + 8.8, cz);
      mesh.rotation.y = normalYaw;

      if (this.scene && typeof this.scene.add === 'function') {
        this.scene.add(mesh);
      }
    }

    const billboard = {
      id,
      data,
      fromNetwork,
      x: data.x,
      y: data.y,
      z: data.z,
      rotation: rot,
      photos,
      loadedImages: [],
      currentPhotoIndex: 0,
      cycleTimer: 0,
      canvas,
      ctx,
      texture,
      mesh
    };

    this.preloadBillboardImages(billboard);
    this.renderBillboard(billboard);
    this.billboards.set(id, billboard);
    return billboard;
  }

  createBillboardFromNetwork(data) {
    return this.createBillboard(data, true);
  }

  syncBillboardsFromServer(list) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      this.createBillboardFromNetwork(item);
    }
  }

  renderBillboard(billboard) {
    const { ctx, canvas, texture, loadedImages, photos, currentPhotoIndex } = billboard;
    if (!ctx || !canvas || !texture) return;

    const w = canvas.width;
    const h = canvas.height;

    // Check if an image is loaded for current photo
    const activeImg = (loadedImages && loadedImages[currentPhotoIndex]) ? loadedImages[currentPhotoIndex] : null;

    if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
      // 1. Solid modern dark backdrop
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // 2. Draw user photo scaled and centered with aspect ratio preservation
      const imgAspect = activeImg.naturalWidth / activeImg.naturalHeight;
      const screenAspect = w / h;
      let drawW, drawH, drawX, drawY;

      if (imgAspect > screenAspect) {
        drawW = w;
        drawH = w / imgAspect;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        drawH = h;
        drawW = h * imgAspect;
        drawX = (w - drawW) / 2;
        drawY = 0;
      }

      ctx.drawImage(activeImg, drawX, drawY, drawW, drawH);

      // 3. High-Tech LED broadcast overlays
      // Top header banner
      ctx.fillStyle = 'rgba(10, 15, 29, 0.82)';
      ctx.fillRect(0, 0, w, 44);

      // Live LED indicator dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(28, 22, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('EN VIVO • PANTALLA GIGANTE VOXEL', 48, 29);

      // Bottom info badge (Photo index if multiple photos)
      if (photos.length > 1) {
        ctx.fillStyle = 'rgba(10, 15, 29, 0.85)';
        ctx.fillRect(w - 220, h - 38, 220, 38);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`FOTO ${currentPhotoIndex + 1} DE ${photos.length} 🔄`, w - 200, h - 14);
      }

      // Border glow
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, w, h);
    } else {
      // No custom image uploaded yet: Render futuristic dynamic cyber advertisement!
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Perspective Grid Lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Center High-Tech Billboard Announcement
      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📺 CARTEL GIGANTE PUBLICITARIO', w / 2, 140);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('¡SUBE TUS PROPIAS FOTOS EN AJUSTES ⚙️!', w / 2, 230);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '600 24px sans-serif';
      ctx.fillText('Menú de Pausa (ESC) ➔ "Subir Fotos / Anuncios"', w / 2, 300);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Tus fotos se proyectarán aquí en vivo y rotarán automáticamente.', w / 2, 360);

      // Glowing border frame
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.textAlign = 'start';
    }

    texture.needsUpdate = true;
  }

  update(dt = 0.05) {
    if (this.billboards.size === 0) return;

    for (const billboard of this.billboards.values()) {
      if (Array.isArray(billboard.photos) && billboard.photos.length > 1) {
        billboard.cycleTimer += dt;
        // Cycle every 3.5 seconds
        if (billboard.cycleTimer >= 3.5) {
          billboard.cycleTimer = 0;
          billboard.currentPhotoIndex = (billboard.currentPhotoIndex + 1) % billboard.photos.length;
          this.renderBillboard(billboard);
        }
      }
    }
  }

  removeBillboard(id) {
    if (!id || !this.billboards.has(id)) return false;
    const b = this.billboards.get(id);
    if (b && b.mesh && this.scene) {
      this.scene.remove(b.mesh);
      if (b.mesh.geometry) b.mesh.geometry.dispose();
      if (b.mesh.material) {
        if (b.mesh.material.map) b.mesh.material.map.dispose();
        b.mesh.material.dispose();
      }
    }
    this.billboards.delete(id);
    return true;
  }

  clear() {
    for (const b of this.billboards.values()) {
      if (b.mesh && this.scene) {
        this.scene.remove(b.mesh);
        if (b.mesh.geometry) b.mesh.geometry.dispose();
        if (b.mesh.material) {
          if (b.mesh.material.map) b.mesh.material.map.dispose();
          b.mesh.material.dispose();
        }
      }
    }
    this.billboards.clear();
  }
}
