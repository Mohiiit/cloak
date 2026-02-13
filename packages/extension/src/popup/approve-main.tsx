import React from "react";
import { createRoot } from "react-dom/client";
import ApproveScreen from "./components/ApproveScreen";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <ApproveScreen />
  </React.StrictMode>,
);
