// public/src/scene.js
// Three.js renderer setup, PBR lighting, soft shadows, dynamic sky, and synchronized day/night cycle
import * as THREE from 'three';

export class SceneManager {
  constructor(canvasContainer) {
    this.container = canvasContainer;

    // --- Three.js Scene & Camera ---
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    this.scene.add(this.camera);

    // --- WebGL Renderer ---
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // --- Dynamic Lighting ---
    // Hemisphere ambient light
    this.hemiLight = new THREE.HemisphereLight(0xa0d8ef, 0x4a7c36, 0.85);
    this.scene.add(this.hemiLight);

    // Directional Sunlight with soft shadows
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 1.0;
    this.sunLight.shadow.camera.far = 160;

    const shadowDist = 45;
    this.sunLight.shadow.camera.left = -shadowDist;
    this.sunLight.shadow.camera.right = shadowDist;
    this.sunLight.shadow.camera.top = shadowDist;
    this.sunLight.shadow.camera.bottom = -shadowDist;
    this.sunLight.shadow.bias = -0.0003;
    this.scene.add(this.sunLight);

    // Directional MoonLight (cool nighttime illumination)
    this.moonLight = new THREE.DirectionalLight(0x6080b0, 0.35);
    this.scene.add(this.moonLight);

    // --- Atmospheric Fog ---
    this.fogColor = new THREE.Color(0xa0d8ef);
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.014);

    // --- Sky Dome Sphere with Gradient Shader ---
    this.buildSkyDome();

    // Resize handling
    window.addEventListener('resize', () => this.onWindowResize());

    // Current graphics profile
    this.quality = 'high';
  }

  buildSkyDome() {
    const skyGeom = new THREE.SphereGeometry(450, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x3275b8) },
        bottomColor: { value: new THREE.Color(0xa0d8ef) },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        offset: { value: 30 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;

        void main() {
          float h = normalize(vWorldPosition + offset).y;
          vec3 sky = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));

          // Subtle sun halo glow
          vec3 dir = normalize(vWorldPosition);
          float sunDot = max(dot(dir, sunDirection), 0.0);
          vec3 sunGlow = vec3(1.0, 0.85, 0.6) * pow(sunDot, 12.0) * 0.7;

          gl_FragColor = vec4(sky + sunGlow, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.skyMesh = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.skyMesh);
  }

  /**
   * Updates lighting and atmosphere according to synchronized normalized day time [0..1]
   * 0.0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
   */
  updateDayNightCycle(timeOfDay, playerPos) {
    // Keep sky dome centered on camera
    this.skyMesh.position.copy(this.camera.position);

    // Sun angle in sky
    const sunAngle = (timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);

    // Position sun light relative to player
    const sunDist = 70;
    this.sunLight.position.set(
      playerPos.x + sunX * sunDist,
      playerPos.y + sunY * sunDist,
      playerPos.z + 20
    );
    this.sunLight.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.sunLight.target.updateMatrixWorld();

    // Opposite position for moon light
    this.moonLight.position.set(
      playerPos.x - sunX * sunDist,
      playerPos.y - sunY * sunDist,
      playerPos.z - 20
    );
    this.moonLight.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.moonLight.target.updateMatrixWorld();

    // Sky Uniforms
    const sunDir = new THREE.Vector3(sunX, sunY, 0.3).normalize();
    this.skyMesh.material.uniforms.sunDirection.value.copy(sunDir);

    // Color Transitions
    const skyUniforms = this.skyMesh.material.uniforms;

    if (sunY > 0.2) {
      // Day (Noon)
      const t = Math.min(1.0, (sunY - 0.2) / 0.5);
      skyUniforms.topColor.value.setRGB(0.18 * t + 0.1, 0.42 * t + 0.2, 0.75 * t + 0.3);
      skyUniforms.bottomColor.value.setRGB(0.55 * t + 0.3, 0.78 * t + 0.4, 0.95 * t + 0.5);

      this.sunLight.intensity = 1.8 * t + 0.4;
      this.sunLight.color.setRGB(1.0, 0.98, 0.92);
      this.moonLight.intensity = 0.05;

      this.hemiLight.intensity = 0.75 * t + 0.2;
      this.hemiLight.color.setRGB(0.65, 0.82, 0.95);
      this.hemiLight.groundColor.setRGB(0.25, 0.4, 0.2);

      this.fogColor.setRGB(0.55 * t + 0.3, 0.78 * t + 0.4, 0.95 * t + 0.5);
      this.scene.fog.color.copy(this.fogColor);
      this.renderer.setClearColor(this.fogColor);
    } else if (sunY > -0.15) {
      // Sunset / Sunrise golden hour
      const t = (sunY + 0.15) / 0.35;
      skyUniforms.topColor.value.setRGB(0.2, 0.2, 0.45);
      skyUniforms.bottomColor.value.setRGB(0.95, 0.45, 0.2);

      this.sunLight.intensity = 0.8 * t + 0.1;
      this.sunLight.color.setRGB(1.0, 0.6, 0.3);
      this.moonLight.intensity = 0.15;

      this.hemiLight.intensity = 0.4;
      this.hemiLight.color.setRGB(0.85, 0.45, 0.3);
      this.hemiLight.groundColor.setRGB(0.2, 0.15, 0.1);

      this.fogColor.setRGB(0.85, 0.5, 0.3);
      this.scene.fog.color.copy(this.fogColor);
      this.renderer.setClearColor(this.fogColor);
    } else {
      // Night
      skyUniforms.topColor.value.setRGB(0.02, 0.04, 0.1);
      skyUniforms.bottomColor.value.setRGB(0.06, 0.09, 0.18);

      this.sunLight.intensity = 0.0;
      this.moonLight.intensity = 0.4;
      this.moonLight.color.setRGB(0.5, 0.65, 0.95);

      this.hemiLight.intensity = 0.2;
      this.hemiLight.color.setRGB(0.12, 0.18, 0.3);
      this.hemiLight.groundColor.setRGB(0.05, 0.08, 0.12);

      this.fogColor.setRGB(0.04, 0.07, 0.14);
      this.scene.fog.color.copy(this.fogColor);
      this.renderer.setClearColor(this.fogColor);
    }
  }

  setGraphicsQuality(profile) {
    this.quality = profile;
    if (profile === 'balanced') {
      this.renderer.shadowMap.enabled = false;
      this.scene.fog.density = 0.018;
      this.renderer.setPixelRatio(1.0);
    } else if (profile === 'high') {
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.scene.fog.density = 0.014;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    } else if (profile === 'ultra') {
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.scene.fog.density = 0.011;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    } else if (profile === 'boost') {
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.scene.fog.density = 0.0085;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
