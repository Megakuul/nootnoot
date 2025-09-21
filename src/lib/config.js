
import { writable } from 'svelte/store';

export const config = writable({
  camera: {
    angle: 0, // in degree. 0deg means the camera is facing horizontal. 90deg means the camera is facing upwords
    fov: 70, // in degree
    rotation: 0,
    scale: 15000
  },
  objectSizes: { // reference this for determening depth of recognized objects
    bird: 0.7, 
    airplane: 20,
  },
  canvas: {
    width: 640,
    height: 640
  }
});

export var map_zoom = writable(1);