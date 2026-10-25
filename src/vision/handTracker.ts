// Camera + MediaPipe hand landmark tracking. No React in here.

import {
  FilesetResolver,
  HandLandmarker,
  type Landmark,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// Keep the wasm version in sync with @mediapipe/tasks-vision in package.json.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** Pairs of landmark indices forming the hand skeleton. */
export const HAND_BONES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export type Handedness = "Left" | "Right";

export interface TrackedHand {
  /** The player's actual hand (corrected for the unmirrored camera feed). */
  handedness: Handedness;
  score: number;
  /** Image-space landmarks (0..1), for drawing. */
  image: NormalizedLandmark[];
  /** Metric 3D landmarks, for scale-free pinch distances. */
  world: Landmark[];
}

export interface HandFrame {
  hands: TrackedHand[];
  /** performance.now() when detection started on this frame. */
  time: number;
  /** performance.now() when the landmarks were ready. */
  detectedAt: number;
  /** When the camera captured the frame, if the browser reports it (else `time`). */
  capturedAt: number;
  /** Video width / height, for aspect-correct angles and distances. */
  aspect: number;
}

export interface TrackingOptions {
  numHands?: number;
}

export class CameraError extends Error {}

async function createLandmarker(numHands: number): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO" as const,
    numHands,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  try {
    return await HandLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    return HandLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("The camera needs HTTPS (or localhost). Open this page over https://.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CameraError(
        "Camera access was blocked. Allow the camera for this site (the camera icon in the address bar or site settings), then try again.",
      );
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new CameraError("No camera was found.");
    if (name === "NotReadableError") {
      throw new CameraError("The camera is in use by another app. Close it and try again.");
    }
    throw new CameraError("Couldn't start the camera.");
  }
}

/**
 * MediaPipe labels handedness as if the image were a mirrored selfie. We feed
 * it the raw (unmirrored) camera frame, so its labels are swapped relative to
 * the player's real hands.
 */
function playerHand(label: string | undefined): Handedness {
  return label === "Left" ? "Right" : "Left";
}

/**
 * Starts the front camera into `video` and calls `onFrame` for every new video
 * frame with the detected hands. Resolves to a stop function.
 */
export async function startHandTracking(
  video: HTMLVideoElement,
  onFrame: (frame: HandFrame) => void,
  { numHands = 1 }: TrackingOptions = {},
): Promise<() => void> {
  const [stream, landmarker] = await Promise.all([
    openCamera(),
    createLandmarker(numHands).catch(() => {
      throw new CameraError("Couldn't load the hand-tracking model. Check the network connection.");
    }),
  ]);

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  let stopped = false;
  let handle = 0;
  const useVideoFrames = "requestVideoFrameCallback" in video;
  let lastTime = -1;

  const tick = (_now?: number, meta?: VideoFrameCallbackMetadata) => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const detectedAt = performance.now();
      const hands = result.landmarks.map((image, i) => ({
        handedness: playerHand(result.handedness[i]?.[0]?.categoryName),
        score: result.handedness[i]?.[0]?.score ?? 0,
        image,
        world: result.worldLandmarks[i],
      }));
      onFrame({
        hands,
        time: now,
        detectedAt,
        capturedAt: meta?.captureTime ?? now,
        aspect: video.videoWidth / (video.videoHeight || 1),
      });
    }
    schedule();
  };
  const schedule = () => {
    handle = useVideoFrames ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };
  schedule();

  return () => {
    stopped = true;
    if (useVideoFrames) video.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    landmarker.close();
  };
}
