"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function PageHeaderAction({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const container = document.getElementById("workspace-header-actions");
  if (!container) {
    return null;
  }

  return createPortal(children, container);
}
