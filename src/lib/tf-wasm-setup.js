// Configure TensorFlow.js WASM binary base path before backend init
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';

// Pin to the installed version to avoid mismatches
setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/');
