import type { Metadata } from "next";
import { GestureView } from "@/components/GestureView";

export const metadata: Metadata = {
  title: "Gesture synth · FretSynth",
};

export default function HomePage() {
  return <GestureView />;
}
