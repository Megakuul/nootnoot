<script>
	import * as tf from "@tensorflow/tfjs";
  import { detectVideo } from "./adapter/yolov8/detect";
  import { Webcam } from "./adapter/yolov8/webcam";
  import { config } from "./config";

  let camera = $state();
  let canvas = $state();

	let model = $state({});

	let useMask = $state(false);

	const webcam = new Webcam(); 

	$effect.root(() => {
		tf.ready().then(async () => {
			const yolov8 = await tf.loadGraphModel("/models/yolov8/model.json", {})
		
			const warmupInput = tf.randomUniform(yolov8.inputs[0].shape, 0, 1, "float32")
			const warmupOutput = yolov8.execute(warmupInput)
			model = {
				net: yolov8,
				inputShape: yolov8.inputs[0].shape,
				outputShape: warmupOutput.map((e) => e.shape)
			}

			tf.dispose([warmupOutput, warmupInput])
			console.log("Model initialized...")
		})
	})
</script>

<div>
	<h1>Dies Das Ananas</h1>
	<div>
		<button class="{useMask ? "bg-amber-600" : "bg-green-700"}" onclick={() => {useMask = !useMask}}>{useMask ? "mask enabled" : "mask disabled"}</button>
		
		<div class="relative">
			<video class="w-full h-full" autoplay muted bind:this={camera} onplay={() => detectVideo(camera, model, canvas, useMask)} oncancel={() => console.log("cancel")}></video>
			<canvas class="absolute top-0 left-0 w-full h-full" width={config.canvas.width} height={config.canvas.height} bind:this={canvas}></canvas>
		</div>
	</div>

	<button onclick={() => {
		webcam.open(camera)
	}}>Start</button>

	<input type="file" accept="video/*" onchange={(e) => {
		const file = e.target.files[0];
		if (!file) return
		const url = URL.createObjectURL(file)
		camera.src = url;
	}} />
</div>