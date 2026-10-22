"use client";

import { useEffect } from "react";
import { PantallaError } from "@/components/pantalla-error";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <PantallaError reset={reset} alto="min-h-screen" />;
}
