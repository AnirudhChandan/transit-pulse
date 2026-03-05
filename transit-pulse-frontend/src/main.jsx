import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// We removed <StrictMode> to prevent the double-render that crashes the Mapbox WebGL context
createRoot(document.getElementById("root")).render(<App />);
