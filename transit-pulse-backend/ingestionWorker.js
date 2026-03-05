import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import axios from "axios";
import dotenv from "dotenv";
import { createClient } from "redis";

dotenv.config();

const redisClient = createClient();
redisClient.on("error", (err) => console.log("[Redis Error]", err));
await redisClient.connect();

const OTD_URL = process.env.DELHI_OTD_API_KEY
  ? `https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=${process.env.DELHI_OTD_API_KEY}`
  : "https://server.nikhilvj.co.in/delhirt/VehiclePositions.pb";

async function fetchAndDecodeTransitData() {
  try {
    console.log(`[Worker] Fetching live GTFS binary stream...`);

    const response = await axios({
      method: "GET",
      url: OTD_URL,
      responseType: "arraybuffer",
      timeout: 10000,
    });

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data),
    );

    const activeBuses = [];

    feed.entity.forEach((entity) => {
      if (entity.vehicle && entity.vehicle.position) {
        const rawTimestamp = entity.vehicle.timestamp;
        const parsedTimestamp =
          typeof rawTimestamp === "object" &&
          rawTimestamp !== null &&
          "low" in rawTimestamp
            ? rawTimestamp.low
            : Number(rawTimestamp);

        activeBuses.push({
          id: entity.vehicle.vehicle.id,
          routeId: entity.vehicle.trip?.routeId || "Unknown",
          latitude: entity.vehicle.position.latitude,
          longitude: entity.vehicle.position.longitude,
          speed: entity.vehicle.position.speed || 0,
          // CRITICAL FIX: Extract bearing for directional icons
          bearing: entity.vehicle.position.bearing || 0,
          timestamp: parsedTimestamp || Math.floor(Date.now() / 1000),
        });
      }
    });

    if (activeBuses.length < 10) {
      console.warn(
        `[Worker] Abnormally low bus count (${activeBuses.length}). Skipping.`,
      );
      return;
    }

    const pipeline = redisClient.multi();
    activeBuses.forEach((bus) => {
      pipeline.hSet("delhi_buses_state", bus.id, JSON.stringify(bus));
    });
    await pipeline.exec();
    console.log(
      `[Worker] Successfully wrote ${activeBuses.length} bus states to Redis.`,
    );
  } catch (error) {
    console.error("[Worker] Polling Error:", error.code || error.message);
  }
}

const POLLING_INTERVAL_MS = 15000;

async function startPolling() {
  while (true) {
    await fetchAndDecodeTransitData();
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
  }
}

startPolling();
