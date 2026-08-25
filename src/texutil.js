import * as THREE from 'three';

let _soft = null;
/** Shared soft round particle sprite — keeps Points from rendering as squares. */
export function softCircleTexture() {
  if (_soft) return _soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rad.addColorStop(0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rad; g.fillRect(0, 0, 64, 64);
  _soft = new THREE.CanvasTexture(c);
  return _soft;
}
