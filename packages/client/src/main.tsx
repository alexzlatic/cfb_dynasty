import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
