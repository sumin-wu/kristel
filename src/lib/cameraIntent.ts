// One-shot flag: the landing strum asks the camera page to open the camera on arrival.

let requested = false;

export function requestCameraOnArrival(): void {
  requested = true;
}

/** True once if the camera was requested; resets the flag. */
export function consumeCameraRequest(): boolean {
  const r = requested;
  requested = false;
  return r;
}
