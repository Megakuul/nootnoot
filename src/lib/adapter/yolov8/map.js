import { config, map_zoom } from '$lib/config.js';
import { get } from 'svelte/store';

export function renderMapIcons(toDraw) {
    let map = document.getElementById('map-container');
    if (!map) return;

    const existing_objects = map.querySelectorAll('.map-object');
    existing_objects.forEach(obj => obj.remove());

    toDraw.forEach(object => {
        let height = object.box[2];
        let width = object.box[3];
        let x = object.box[0] + height/2 - config.canvas.height/2;
        let y = object.box[1] + width/2 - config.canvas.width/2;
        let size = Math.max(height, width);
        let klass = 'none';
        let defaultSize = 1
        if (object.klass == 4) {defaultSize = config.objectSizes.airplane; klass ="fa-plane"};
        if (object.klass == 14) {defaultSize = config.objectSizes.bird; klass = "fa-crow"};
        
        let angle_X = calculateHorizontalAngle(x, config.camera.fov, config.canvas.width) + config.camera.rotation * (Math.PI / 180);

        let distance = defaultSize / size * config.camera.scale;

        let rel_x = Math.sin(angle_X) * distance * get(map_zoom);
        let rel_y = Math.cos(angle_X) * distance * get(map_zoom);

        let icon = document.createElement('i');
        icon.classList.add('map-object')
        icon.classList.add('fa-solid')
        icon.classList.add(klass);
        icon.style.translate = rel_x+"% -"+rel_y+"%";
        map.appendChild(icon);
    });
}

// this is AI slop.
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

export function zoom_in() {
    map_zoom.update(n => Math.min(5, n + 0.2));
    console.log(get(map_zoom))
}

export function zoom_out() {
    map_zoom.update(n => Math.max(0.2, n - 0.2));
    console.log(get(map_zoom))
}