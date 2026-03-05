import { useEffect } from "react";
import { io } from "socket.io-client";
import TransitMap from "./components/TransitMap";
import { useTransitStore } from "./store/useTransitStore";
import "./App.css";

// Ensure this matches your backend port (4000)
const SOCKET_SERVER_URL = "http://localhost:4000";

function App() {
  const setBuses = useTransitStore((state) => state.setBuses);

  useEffect(() => {
    // Initialize socket connection
    const socket = io(SOCKET_SERVER_URL);

    socket.on("connect", () => {
      console.log("✅ Connected to WebSocket Server");
    });

    socket.on("transit-update", (data) => {
      // Direct injection into store
      console.log(`📡 Received ${data.length} bus updates`);
      setBuses(data);
    });

    socket.on("disconnect", () => {
      console.log("❌ Disconnected from WebSocket Server");
    });

    socket.on("connect_error", (err) => {
      console.error("⚠️ Connection Error:", err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [setBuses]);

  return (
    <div className="app-container">
      <TransitMap />
    </div>
  );
}

export default App;
