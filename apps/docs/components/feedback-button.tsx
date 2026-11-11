"use client";

import { useEffect } from "react";
import { destroy, init, open } from "featurespace";

export function FeedbackButton() {
  useEffect(() => {
    init({
      board: "todalo",
      metadata: { app: "help" },
      button: false,
      annotations: false,
      newFeatures: false,
      color: "#c8342b",
    });
    return destroy;
  }, []);

  return <button type="button" className="text-link" onClick={() => open()}>Send feedback <span aria-hidden="true">↗</span></button>;
}
