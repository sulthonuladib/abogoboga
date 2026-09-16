import WebSocket from "ws";
import amqp from "amqplib";

const marketStreamUrl = "wss://stream.binance.com:9443/stream?streams=";

let rabbitMqClosed = 0;

const SymbolStore = new Map();

let reconnectTimeout;
let pingInterval;

/**
 * @param {string} url
 * @param {import("amqplib").Channel} channel
 */
function stream(url, channel) {
  const socket = new WebSocket(url);
  socket.on("open", () => {
    console.log("connected");
    if (rabbitMqClosed == 1) {
      return;
    }
    channel.sendToQueue(
      "crawler-logs",
      Buffer.from(JSON.stringify({ market: "binance", status: "connected" })),
    );
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    pingInterval = setInterval(() => {
      console.log("pinging binance");
      if (rabbitMqClosed == 1) {
        return;
      }
      channel.sendToQueue(
        "crawler-logs",
        Buffer.from(JSON.stringify({ market: "binance", status: "ping" })),
      );
      socket.ping();
    }, 5000);
  });

  socket.on("close", async () => {
    console.log("closed");
    if (rabbitMqClosed == 1) {
      return;
    }
    channel.sendToQueue(
      "crawler-logs",
      Buffer.from(JSON.stringify({ market: "binance", status: "closed" })),
    );
    if (pingInterval) {
      clearTimeout(pingInterval);
    }

    reconnectTimeout = setTimeout(async () => {
      stream(url, channel);
    }, 2000);
  });

  socket.on("error", (error) => {
    console.log(error);
    if (rabbitMqClosed == 1) {
      return;
    }
    channel.sendToQueue(
      "crawler-logs",
      Buffer.from(JSON.stringify({ market: "binance", status: "error" })),
    );
    socket.close();
  });

  socket.on("ping", () => {
    console.log("got ping from binance sending pong");
    if (rabbitMqClosed == 1) {
      return;
    }
    channel.sendToQueue(
      "crawler-logs",
      Buffer.from(JSON.stringify({ market: "binance", status: "pong" })),
    );
    socket.pong();
  });

  socket.on("message", (event) => {
    const message = JSON.parse(event.toString());

    if ("stream" in message) {
      const { asks, bids } = message.data;
      const cmcId = SymbolStore.get(message.stream);
      if (rabbitMqClosed == 1) {
        return;
      }
      channel.sendToQueue(
        "binance",
        Buffer.from(JSON.stringify({ cmcId, asks, bids })),
      );
      return;
    }
    return;
  });
}

async function main() {
  const coins = await ActiveCoin.find({ binance: true });
  console.log(coins.length);
  const params = coins
    .filter(filterSolo)
    .map(({ binanceAlternateSymbol, cmcId }) => {
      const params = binanceAlternateSymbol + "usdt@depth20@1000ms";
      SymbolStore.set(params, cmcId);
      return params;
    })
    .join("/");
  const url = marketStreamUrl + params;

  const connection = await amqp.connect(
    process.env.AMQP_URL || "amqp://localhost",
  );
  const channel = await connection.createChannel();

  stream(url, channel);
}

main();
