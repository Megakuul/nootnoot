<script>
import { zoom_in, zoom_out } from '$lib/adapter/yolov8/map.js';
import { config } from '$lib/config.js';

const fov = config.camera.fov;
const rotation = config.camera.rotation;
const halfFov = fov / 2;
const x1 = 50 - 50 * Math.tan(halfFov * Math.PI / 180);
const x2 = 50 + 50 * Math.tan(halfFov * Math.PI / 180);
const clipPath = `polygon(${x1}% 0, ${x2}% 0, 50% 100%)`;
</script>

<div id="map-container">
    <div class="camera-fov" style="clip-path: {clipPath}; transform: translate(-50%, -100%) rotate({rotation}deg);"></div>
    <div class="fa-solid fa-camera"></div>
</div>
<div class="map-toolbar">
    <i class="fa-solid fa-magnifying-glass-plus" on:click={zoom_in}></i>
    <i class="fa-solid fa-magnifying-glass-minus" on:click={zoom_out}></i>
</div>
<style>
    #map-container {
        height: 500px;
        width: 500px;
        position: relative;
        border: 2px #000 solid;
        overflow: hidden;
        background: rgb(119, 199, 119);
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