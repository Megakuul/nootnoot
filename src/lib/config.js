
import { writable } from 'svelte/store';

export const config = {
  camera: {
    angle: 0, // in degree. 0deg means the camera is facing horizontal. 90deg means the camera is facing upwords
    fov: 70, // in degree
    rotation: 14,
    scale: 30000
  },
  objectSizes: { // reference this for determening depth of recognized objects
    bird: 1, 
    airplane: 20,
  },
  canvas: {
    width: 640,
    height: 640
  }
};

export var map_zoom = writable(1);