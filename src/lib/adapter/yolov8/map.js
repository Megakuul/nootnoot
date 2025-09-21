import { config, map_zoom } from '$lib/config.js';
import { get } from 'svelte/store';

let lastRenderTs = 0;
const RENDER_MIN_INTERVAL_MS = 120; // throttle DOM updates

export function renderMapIcons(toDraw) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - lastRenderTs < RENDER_MIN_INTERVAL_MS) return;
    lastRenderTs = now;
    let map = document.getElementById('map-container');
    if (!map) return;

    const existing_objects = map.querySelectorAll('.map-object');
    existing_objects.forEach(obj => obj.remove());

    const configValue = get(config); // Get current config value

    toDraw.forEach(object => {
    let height = object.box[2];
    let width = object.box[3];
    // Offsets of bbox center from image center (pixels)
    const centerYOffset = object.box[0] + height/2 - configValue.canvas.height/2; // vertical offset
    const centerXOffset = object.box[1] + width/2 - configValue.canvas.width/2;   // horizontal offset
        let size = Math.max(height, width);
        let klass = 'none';
        let defaultSize = 1
        if (object.klass == 4) {defaultSize = configValue.objectSizes.airplane; klass ="fa-plane"};
        if (object.klass == 14) {defaultSize = configValue.objectSizes.bird; klass = "fa-crow"};
        
    // Horizontal bearing (in-plane), includes camera rotation
    let angle_X = calculateHorizontalAngle(centerXOffset, configValue.camera.fov, configValue.canvas.width) + configValue.camera.rotation * (Math.PI / 180);

    // Base slant distance from apparent size
    let distance = defaultSize / size * configValue.camera.scale;

    // Account for upward tilt: reduce distance by cos(total elevation)
    // Estimate vertical angle from bbox center and camera tilt (angle)
    const tiltRad = (configValue.camera.angle || 0) * (Math.PI / 180);
    // Derive vertical FOV from horizontal FOV and aspect ratio for better accuracy
    const aspect = configValue.canvas.height / configValue.canvas.width;
    const fovX_rad = (configValue.camera.fov || 0) * (Math.PI / 180);
    const fovY_rad = 2 * Math.atan(Math.tan(fovX_rad / 2) * aspect);
    const fovY_deg = fovY_rad * (180 / Math.PI);
    const angle_Y = calculateVerticalAngle(centerYOffset, fovY_deg, configValue.canvas.height); // vertical offset (positive is up)
    const elevation = angle_Y + tiltRad;
    const groundDistance = Math.max(0, distance * Math.cos(elevation));

    let rel_x = Math.sin(angle_X) * groundDistance * get(map_zoom);
    let rel_y = Math.cos(angle_X) * groundDistance * get(map_zoom);

        let icon = document.createElement('i');
        icon.classList.add('map-object')
        icon.classList.add('fa-solid')
        icon.classList.add(klass);
        icon.style.translate = rel_x+"% -"+rel_y+"%";
        map.appendChild(icon);
    });
}

// this is AI slop.
/**
 * @param {number} pixelX
 * @param {number} fovX
 * @param {number} imageWidth
 * @returns {number} angle in radians
 */
function calculateHorizontalAngle(pixelX, fovX, imageWidth) {
  // 1. Calculate half of the FOV in radians
  const halfFovX_rad = (fovX / 2) * (Math.PI / 180);

  // 2. Calculate the tangent of half the FOV
  const tanHalfFovX = Math.tan(halfFovX_rad);

  // 3. Calculate half of the image width
  const halfImageWidth = imageWidth / 2;
  
  // 4. Calculate the angle in radians using the formula
  const angle_rad = Math.atan((pixelX * tanHalfFovX) / halfImageWidth);
  
  // 5. Convert the angle back to degrees and return it
    return angle_rad
}

// Estimate vertical angle (radians) from vertical pixel offset, FOV and image height
/**
 * @param {number} pixelY
 * @param {number} fovY
 * @param {number} imageHeight
 * @returns {number} angle in radians
 */
function calculateVerticalAngle(pixelY, fovY, imageHeight) {
    const halfFovY_rad = (fovY / 2) * (Math.PI / 180);
    const tanHalfFovY = Math.tan(halfFovY_rad);
    const halfImageHeight = imageHeight / 2;
    // Make positive angles point upwards: screen Y increases downwards
    const angle_rad = -Math.atan((pixelY * tanHalfFovY) / halfImageHeight);
    return angle_rad;
}

export function zoom_in() {
    map_zoom.update(n => Math.min(5, n + 0.2));
}

export function zoom_out() {
    map_zoom.update(n => Math.max(0.2, n - 0.2));
}