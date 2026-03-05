import React, { useState, useEffect, useRef } from "react";
// We import the raw Mapbox engine directly. No React wrappers. No memory leaks.
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import DeckGL from "@deck.gl/react";
import {
  ScatterplotLayer,
  IconLayer,
  TextLayer,
  PathLayer,
} from "@deck.gl/layers";
import { useTransitStore } from "../store/useTransitStore";

const INITIAL_VIEW_STATE = {
  longitude: 77.209,
  latitude: 28.6139,
  zoom: 14.5,
  pitch: 60,
  bearing: 0,
};

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const ARROW_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Cpath d=%22M50 10 L90 90 L50 70 L10 90 Z%22 fill=%22%23ffffff%22/%3E%3C/svg%3E`;

export default function TransitMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  const {
    buses,
    selectedBus,
    routePath,
    setSelectedBus,
    setRoutePath,
    clearSelection,
  } = useTransitStore();
  const [isReady, setIsReady] = useState(false);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 250);
    return () => clearTimeout(timer);
  }, []);

  // 1. Manually instantiate the 3D Mapbox engine (The proven working architecture)
  useEffect(() => {
    if (!isReady || mapRef.current || !mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: INITIAL_VIEW_STATE.zoom,
      pitch: INITIAL_VIEW_STATE.pitch,
      bearing: INITIAL_VIEW_STATE.bearing,
      interactive: false,
    });

    mapRef.current.on("style.load", () => {
      mapRef.current.addLayer({
        id: "3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": "#1a1a1a",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": 0.8,
        },
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isReady]);

  // 2. Sync Deck.gl camera with Mapbox
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.jumpTo({
        center: [viewState.longitude, viewState.latitude],
        zoom: viewState.zoom,
        pitch: viewState.pitch,
        bearing: viewState.bearing,
      });
    }
  }, [viewState]);

  // 3. Mock API Call for the Polyline
  const fetchRouteShape = async (routeId, lat, lng) => {
    const mockPath = [
      {
        path: [
          [lng - 0.01, lat - 0.01],
          [lng - 0.005, lat],
          [lng, lat],
          [lng + 0.005, lat + 0.01],
          [lng + 0.015, lat + 0.008],
        ],
        routeId: routeId,
      },
    ];
    setRoutePath(mockPath);
  };

  const handleMapClick = (info) => {
    if (info.object) {
      setSelectedBus(info.object);
      fetchRouteShape(
        info.object.routeId,
        info.object.latitude,
        info.object.longitude,
      );
    } else {
      clearSelection();
    }
  };

  const validBuses = buses.filter((b) => b.latitude && b.longitude);

  const layers = [
    routePath &&
      new PathLayer({
        id: "route-path",
        data: routePath,
        pickable: false,
        widthScale: 20,
        widthMinPixels: 4,
        getPath: (d) => d.path,
        getColor: [0, 255, 255, 200],
        getWidth: (d) => 2,
      }),

    new ScatterplotLayer({
      id: "bus-glow",
      data: validBuses,
      getPosition: (d) => [d.longitude, d.latitude],
      getFillColor: (d) => {
        const isSelected = selectedBus && selectedBus.id === d.id;
        const isUnselected = selectedBus && selectedBus.id !== d.id;
        const baseColor = d.speed > 2 ? [0, 255, 255] : [255, 20, 147];
        return isUnselected
          ? [...baseColor, 5]
          : [...baseColor, isSelected ? 80 : 40];
      },
      getRadius: 100,
      radiusMinPixels: 6,
      radiusMaxPixels: 25,
      transitions: { getPosition: 2000 },
      updateTriggers: { getFillColor: [selectedBus] },
    }),

    new IconLayer({
      id: "bus-icon",
      data: validBuses,
      iconAtlas: ARROW_SVG,
      iconMapping: {
        marker: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          mask: true,
          anchorY: 50,
          anchorX: 50,
        },
      },
      getIcon: () => "marker",
      getPosition: (d) => [d.longitude, d.latitude],
      getAngle: (d) => d.bearing || 0,
      getSize: 24,
      getColor: (d) => {
        const isSelected = selectedBus && selectedBus.id === d.id;
        const isUnselected = selectedBus && selectedBus.id !== d.id;
        const baseColor = d.speed > 2 ? [0, 255, 255] : [255, 20, 147];
        return isUnselected ? [...baseColor, 50] : [...baseColor, 255];
      },
      pickable: true,
      onClick: handleMapClick,
      transitions: { getPosition: 2000, getAngle: 2000 },
      updateTriggers: { getColor: [selectedBus] },
    }),

    new TextLayer({
      id: "bus-routes",
      data: validBuses,
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => (d.routeId === "Unknown" ? "" : String(d.routeId)),
      getSize: viewState.zoom > 13.5 ? 12 : 0,
      getColor: (d) => {
        const isUnselected = selectedBus && selectedBus.id !== d.id;
        return isUnselected ? [255, 255, 255, 50] : [255, 255, 255, 255];
      },
      getPixelOffset: [0, -20],
      fontFamily: "monospace",
      fontWeight: "bold",
      background: true,
      getBackgroundColor: (d) => {
        const isUnselected = selectedBus && selectedBus.id !== d.id;
        return isUnselected ? [10, 10, 10, 50] : [10, 10, 10, 200];
      },
      backgroundPadding: [4, 4],
      transitions: { getPosition: 2000 },
      updateTriggers: {
        getSize: [viewState.zoom],
        getColor: [selectedBus],
        getBackgroundColor: [selectedBus],
      },
    }),
  ];

  if (!isReady) {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }} />
    );
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0a0a0a",
      }}
    >
      {/* LAYER 1: Raw Mapbox DOM Container - Protected from React Re-renders */}
      <div
        ref={mapContainer}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      />

      {/* LAYER 2: Deck.gl Overlay intercepting mouse events */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
        }}
      >
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState }) => setViewState(viewState)}
          controller={true}
          layers={layers}
          useDevicePixels={false}
          onClick={handleMapClick}
          glOptions={{ preserveDrawingBuffer: true, alpha: true }}
          getTooltip={({ object }) =>
            object &&
            !selectedBus && {
              html: `
              <div style="font-family: monospace; font-size: 14px;">
                <div style="color: #888; font-size: 10px; margin-bottom: 4px;">VEHICLE TELEMETRY</div>
                <div><span style="color: #00ffff">ROUTE:</span> <b>${object.routeId}</b></div>
                <div><span style="color: #00ffff">SPEED:</span> ${Math.round(object.speed * 3.6)} km/h</div>
              </div>
            `,
              style: {
                backgroundColor: "rgba(15, 15, 15, 0.95)",
                border: "1px solid rgba(0, 255, 255, 0.3)",
                borderRadius: "6px",
                padding: "12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.8)",
              },
            }
          }
        />
      </div>

      {/* Target Lock UI */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "rgba(10, 10, 10, 0.9)",
          color: "#fff",
          padding: "20px",
          borderRadius: "12px",
          zIndex: 3,
          fontFamily: "system-ui, -apple-system, sans-serif",
          border: selectedBus
            ? "1px solid rgba(0, 255, 255, 0.5)"
            : "1px solid rgba(255,255,255,0.1)",
          boxShadow: selectedBus
            ? "0 0 20px rgba(0,255,255,0.2)"
            : "0 8px 32px rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          pointerEvents: "none",
          minWidth: "220px",
          transition: "all 0.3s ease",
        }}
      >
        {selectedBus ? (
          <>
            <div
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "2px",
                color: "#00ffff",
                marginBottom: "4px",
              }}
            >
              Target Lock Active
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "800",
                  color: "#fff",
                  lineHeight: "1",
                }}
              >
                {selectedBus.routeId}
              </div>
              <div
                style={{ fontSize: "0.9rem", color: "#aaa", lineHeight: "1.2" }}
              >
                Route
                <br />
                Number
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "0.85rem",
                color: "#ccc",
              }}
            >
              <div>
                <span style={{ color: "#888" }}>VEHICLE ID:</span>{" "}
                {selectedBus.id}
              </div>
              <div>
                <span style={{ color: "#888" }}>VELOCITY:</span>{" "}
                {Math.round(selectedBus.speed * 3.6)} km/h
              </div>
              <div>
                <span style={{ color: "#888" }}>HEADING:</span>{" "}
                {Math.round(selectedBus.bearing)}&deg;
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "2px",
                color: "#888",
                marginBottom: "4px",
              }}
            >
              Delhi Transit Authority
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "800",
                  color: "#fff",
                  lineHeight: "1",
                }}
              >
                {validBuses.length.toLocaleString()}
              </div>
              <div
                style={{ fontSize: "0.9rem", color: "#aaa", lineHeight: "1.2" }}
              >
                Active
                <br />
                Signals
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "0.85rem",
                color: "#ccc",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: "#00ffff",
                    boxShadow: "0 0 8px #00ffff",
                  }}
                />
                <span>Moving (&gt;2 m/s)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: "#ff1493",
                    boxShadow: "0 0 8px #ff1493",
                  }}
                />
                <span>Stopped / Traffic</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
