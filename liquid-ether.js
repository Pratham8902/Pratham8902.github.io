import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('liquid-glass-bg');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pointer = new THREE.Vector2(0.5, 0.5);
  const smoothPointer = new THREE.Vector2(0.5, 0.5);
  const velocity = new THREE.Vector2(0, 0);
  const targetVelocity = new THREE.Vector2(0, 0);
  const lastPointer = new THREE.Vector2(0.5, 0.5);
  const clock = new THREE.Clock();

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPointer: { value: smoothPointer },
    uVelocity: { value: velocity },
    uGoldA: { value: new THREE.Color('#f8df9b') },
    uGoldB: { value: new THREE.Color('#c9a44a') },
    uGoldC: { value: new THREE.Color('#6f5420') },
  };

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uPointer;
      uniform vec2 uVelocity;
      uniform vec3 uGoldA;
      uniform vec3 uGoldB;
      uniform vec3 uGoldC;

      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        mat2 rotate = mat2(0.8, -0.6, 0.6, 0.8);

        for (int i = 0; i < 5; i++) {
          value += amplitude * noise(p);
          p = rotate * p * 2.05 + 17.0;
          amplitude *= 0.5;
        }

        return value;
      }

      void main() {
        vec2 uv = vUv;
        vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
        vec2 p = (uv - 0.5) * aspect;
        vec2 m = (uPointer - 0.5) * aspect;
        float t = uTime * 0.18;

        vec2 toMouse = p - m;
        float mouseDist = length(toMouse);
        float mouseGlow = exp(-mouseDist * 5.8);
        float mousePull = exp(-mouseDist * 3.25);

        vec2 flow = vec2(
          fbm(p * 2.1 + vec2(t, -t * 0.7)),
          fbm(p * 2.1 + vec2(-t * 0.55, t * 0.9) + 8.4)
        ) - 0.5;

        float speed = clamp(length(uVelocity) * 4.2, 0.0, 1.0);
        vec2 direction = normalize(uVelocity + 0.0001);
        vec2 tangent = vec2(-direction.y, direction.x);
        vec2 glide = direction * mousePull * (0.028 + speed * 0.055);
        vec2 gelShift = tangent * mousePull * sin(dot(toMouse, tangent) * 8.0) * 0.012 * speed;
        vec2 warped = p + flow * 0.18 - glide + gelShift;

        float ribbons = 0.0;
        ribbons += smoothstep(0.55, 0.96, fbm(warped * 3.0 + vec2(t * 1.6, 0.0)));
        ribbons += 0.65 * smoothstep(0.58, 0.98, fbm(warped * 5.2 - vec2(0.0, t * 1.15)));
        ribbons += 0.35 * smoothstep(0.62, 1.0, fbm(warped * 8.0 + flow * 1.8));

        float vein = abs(sin((warped.x * 3.4 + warped.y * 2.1 + fbm(warped * 4.0) * 2.8 + t * 2.1) * 3.14159));
        vein = smoothstep(0.84, 1.0, vein) * 0.32;

        float vignette = smoothstep(0.88, 0.18, length((uv - 0.5) * vec2(aspect.x, 1.0)));
        float energy = clamp(ribbons * 0.62 + vein + mouseGlow * (0.035 + speed * 0.045), 0.0, 1.0);

        vec3 gold = mix(uGoldC, uGoldB, smoothstep(0.08, 0.72, energy));
        gold = mix(gold, uGoldA, smoothstep(0.62, 1.0, energy));

        vec3 color = gold * energy;
        float alpha = (energy * 0.48 + mouseGlow * 0.018) * vignette;

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    uniforms.uResolution.value.set(width * dpr, height * dpr);
  }

  function setPointer(clientX, clientY) {
    pointer.set(clientX / window.innerWidth, 1.0 - clientY / window.innerHeight);
    document.body.style.setProperty('--cursor-x', `${clientX}px`);
    document.body.style.setProperty('--cursor-y', `${clientY}px`);
  }

  function render() {
    const delta = Math.min(clock.getDelta(), 0.033);
    uniforms.uTime.value += reduceMotion ? delta * 0.18 : delta;

    smoothPointer.lerp(pointer, reduceMotion ? 0.16 : 0.045);
    targetVelocity.copy(smoothPointer).sub(lastPointer).multiplyScalar(1.0 / Math.max(delta, 0.016));
    velocity.lerp(targetVelocity, reduceMotion ? 0.1 : 0.085);
    velocity.multiplyScalar(reduceMotion ? 0.82 : 0.9);
    lastPointer.copy(smoothPointer);

    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (event) => setPointer(event.clientX, event.clientY), { passive: true });
  window.addEventListener('pointerdown', (event) => setPointer(event.clientX, event.clientY), { passive: true });

  render();
}
