<script>
    import { config } from './config.js';
</script>

<div class="settings-container">
    <div class="slidecontainer">
        <div>Angle: {$config.camera.angle}°</div>
        <input type="range" min="0" max="45" bind:value={$config.camera.angle} class="angle" id="angle">
    </div>
    <div class="slidecontainer">
        <div>Rotation: {$config.camera.rotation}°</div>
        <input type="range" min="0" max="360" bind:value={$config.camera.rotation} class="rotation" id="rotation">
    </div>
    <div class="slidecontainer">
        <div>Field of View: {$config.camera.fov}°</div>
        <input type="range" min="1" max="175" bind:value={$config.camera.fov} class="fov" id="fov">
    </div>
</div>

<style>
    .settings-container {
        width: 100%;
    }
    .settings-container input {
        width: 100%;
    }

    input[type="range"] {
        appearance: none;
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(90deg, #4caf50, #81c784);
        outline: none;
        margin: 6px 0 16px 0;
    }
    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #4caf50;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    input[type="range"]::-moz-range-thumb {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #4caf50;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
</style>