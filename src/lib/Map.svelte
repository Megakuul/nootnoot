<script>
import { zoom_in, zoom_out } from '$lib/adapter/yolov8/map.js';
import { config, map_zoom } from '$lib/config.js';

// Make these reactive to config changes
$: fov = $config.camera.fov;
$: rotation = $config.camera.rotation;
$: tilt = $config.camera.angle || 0;
$: halfFov = fov / 2;
$: x1 = 50 - 50 * Math.tan(halfFov * Math.PI / 180);
$: x2 = 50 + 50 * Math.tan(halfFov * Math.PI / 180);
$: clipPath = `polygon(${x1}% 0, ${x2}% 0, 50% 100%)`;
// Visualize tilt by squeezing the FOV vertically by cos(tilt)
$: tiltScaleY = Math.cos((tilt * Math.PI) / 180);
</script>

<div id="map-container">
    <div class="camera-fov" style="clip-path: {clipPath}; transform: translate(-50%, -100%) rotate({rotation}deg) scaleY({tiltScaleY});"></div>
    <div class="fa-solid fa-camera"></div>
</div>
<div class="map-toolbar">
    <button type="button" class="icon-btn" onclick={zoom_in} aria-label="Zoom in">
        <i class="fa-solid fa-magnifying-glass-plus"></i>
    </button>
    <button type="button" class="icon-btn" onclick={zoom_out} aria-label="Zoom out">
        <i class="fa-solid fa-magnifying-glass-minus"></i>
    </button>
    <span>{$map_zoom.toFixed(1)}x</span>
    
</div>
<style>
    .map-toolbar > * {
        padding: 5px;
        cursor: pointer;
        user-select: none;
    }
    .icon-btn {
        border: none;
        background: transparent;
    }
    #map-container {
        height: 500px;
        width: 500px;
        position: relative;
        overflow: hidden;
        background: rgb(119, 199, 119);
        border-radius: 15px;
    }
    .camera-fov {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 1000px;
        height: 500px;
        transform-origin: bottom center;
        background-color: rgba(0, 0, 0, 0.2);
    }
    :global(.fa-camera), :global(.map-object) {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        
        border-radius: 50%;
        color: #000;
    }

    :global(.fa-camera) {
        width: 50px;
        height: 50px;
        font-size: 26px;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #ffffffb0;
    }
    :global(.map-object) {
        width: 8px;
        height: 8px;
    }

</style>