"use client";

import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/first-touch";

export function FirstTouchCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);
  return null;
}
