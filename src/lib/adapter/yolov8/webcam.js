/**
 * Class to handle webcam
 */
export class Webcam {
  /**
   * Open webcam and stream it through video tag.
   * @param {HTMLVideoElement} videoRef video tag reference
   * @returns {Promise} Promise that resolves when camera is opened
   */
  open = (videoRef) => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return navigator.mediaDevices
        .getUserMedia({
          audio: false,
          video: {
            facingMode: "environment",
          },
        })
        .then((stream) => {
          videoRef.srcObject = stream;
          return stream;
        })
        .catch((error) => {
          console.error("Failed to access webcam:", error);
          throw new Error("Can't open Webcam! " + error.message);
        });
    } else {
      return Promise.reject(new Error("MediaDevices API not supported!"));
    }
  };

  /**
   * Close opened webcam.
   * @param {HTMLVideoElement} videoRef video tag reference
   */
  close = (videoRef) => {
    if (videoRef.srcObject && videoRef.srcObject instanceof MediaStream) {
      videoRef.srcObject.getTracks().forEach((track) => {
        track.stop();
      });
      videoRef.srcObject = null;
    }
  };
}