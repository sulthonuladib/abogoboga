import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

import { workerArgvMarker } from "./BootstrapCoin.ts"
import { decodeTickLine, type CanonicalTick } from "./CanonicalTick.ts"

/**
 * Runnable contract fixture: a real worker subprocess on a synthetic source.
 */
const fixturePath = fileURLToPath(new URL("./testing/dummy-worker.ts", import.meta.url))

/**
 * A spawned fixture plus the stdout/stderr/stdin handles the assertions use.
 */
interface SpawnedWorker {
  readonly process: Bun.Subprocess<"pipe", "pipe", "pipe">
  readonly stdoutLines: Array<string>
  readonly ticks: Array<CanonicalTick>
  readonly stderrText: () => string
  readonly writeLine: (line: string) => Promise<void>
  readonly closeStdin: () => Promise<void>
}

/**
 * Consumes a byte stream, splitting it into complete lines and flushing any
 * trailing line at EOF.
 *
 * @param stream - Pipe from the spawned worker.
 * @param onLine - Called once per complete line (without the newline).
 */
const pumpLines = async (
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    for (;;) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      let newline = buffer.indexOf("\n")

      while (newline >= 0) {
        onLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
      }
    }

    if (buffer.trim() !== "") {
      onLine(buffer)
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Spawns the fixture worker with pipes on every stdio edge and starts pumping
 * stdout into decoded ticks and raw lines.
 *
 * @param args - Worker argv entries after the executable and fixture path.
 */
const spawnWorker = (args: ReadonlyArray<string>): SpawnedWorker => {
  const child = Bun.spawn(["bun", fixturePath, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  })

  const stdoutLines: Array<string> = []
  const ticks: Array<CanonicalTick> = []
  const stderrChunks: Array<string> = []

  void pumpLines(child.stdout, (line) => {
    stdoutLines.push(line)

    const tick = decodeTickLine(line)

    if (tick !== null) {
      ticks.push(tick)
    }
  })
  void pumpLines(child.stderr, (line) => {
    stderrChunks.push(line)
  })

  return {
    process: child,
    stdoutLines,
    ticks,
    stderrText: () => stderrChunks.join("\n"),
    writeLine: async (line) => {
      void child.stdin.write(`${line}\n`)
      await child.stdin.flush()
    },
    closeStdin: async () => {
      await child.stdin.end()
    }
  }
}

/**
 * Polls a condition until it holds or the timeout expires.
 *
 * @param condition - Predicate over the worker's observed output.
 * @param what - Description used in the timeout error.
 * @param timeoutMillis - Maximum time to wait.
 */
const waitFor = async (
  condition: () => boolean,
  what: string,
  timeoutMillis = 5000
): Promise<void> => {
  const deadline = Date.now() + timeoutMillis

  while (Date.now() < deadline) {
    if (condition()) {
      return
    }

    await Bun.sleep(20)
  }

  throw new Error(`timed out waiting for ${what}`)
}

describe("runStdioWorker", () => {
  test(
    "boots on argv coins, emits canonical ticks on stdout, and logs on stderr",
    async () => {
      const worker = spawnWorker([workerArgvMarker, "dummy", "shard-1", "BTC:bitcoin,ETH:ethereum"])

      try {
        await waitFor(
          () =>
            worker.ticks.some((tick) => tick.symbol === "BTC") &&
            worker.ticks.some((tick) => tick.symbol === "ETH"),
          "BTC and ETH ticks"
        )

        expect(worker.ticks.every((tick) => tick.exchangeSlug === "dummy")).toBe(true)
        expect(worker.ticks.every((tick) => Number.isInteger(tick.timestamp))).toBe(true)
        expect(worker.stdoutLines.length).toBeGreaterThan(0)
        expect(worker.stdoutLines.every((line) => decodeTickLine(line) !== null)).toBe(true)

        await waitFor(() => worker.stderrText().includes("worker: boot"), "boot log on stderr")
        expect(worker.stderrText()).toContain("BTC:bitcoin,ETH:ethereum")
        expect(worker.stdoutLines.some((line) => line.includes("worker: boot"))).toBe(false)
      } finally {
        worker.process.kill()
      }
    },
    15000
  )

  test(
    "applies live subscribe and unsubscribe and ignores malformed lines",
    async () => {
      const worker = spawnWorker([workerArgvMarker, "dummy", "shard-1", "BTC:bitcoin"])

      try {
        await waitFor(() => worker.ticks.some((tick) => tick.symbol === "BTC"), "initial BTC tick")

        const btcBeforeSubscribe = worker.ticks.filter((tick) => tick.symbol === "BTC").length

        await worker.writeLine(`{"type":"subscribe","coins":[{"symbol":"SOL","coingeckoId":"solana"}]}`)
        await waitFor(() => worker.ticks.some((tick) => tick.symbol === "SOL"), "SOL tick")
        await waitFor(
          () => worker.ticks.filter((tick) => tick.symbol === "BTC").length > btcBeforeSubscribe,
          "BTC ticks continuing after subscribe"
        )

        await worker.writeLine(`{"type":"unsubscribe","coins":[{"symbol":"SOL","coingeckoId":"solana"}]}`)
        await waitFor(
          () => worker.stderrText().includes("worker: unsubscribed SOL:solana"),
          "unsubscribe log"
        )
        await Bun.sleep(200)

        const solTicksAfterUnsubscribe = worker.ticks.filter((tick) => tick.symbol === "SOL").length

        await Bun.sleep(250)

        expect(worker.ticks.filter((tick) => tick.symbol === "SOL").length).toBe(
          solTicksAfterUnsubscribe
        )

        const btcBeforeMalformed = worker.ticks.filter((tick) => tick.symbol === "BTC").length

        await worker.writeLine("this is not a command")

        await waitFor(
          () => worker.ticks.filter((tick) => tick.symbol === "BTC").length > btcBeforeMalformed,
          "BTC ticks after malformed line"
        )
        await waitFor(
          () => worker.stderrText().includes("ignoring malformed stdin line"),
          "malformed-line log"
        )
        expect(worker.process.exitCode).toBeNull()
      } finally {
        worker.process.kill()
      }
    },
    15000
  )

  test(
    "closing stdin makes the worker exit 0",
    async () => {
      const worker = spawnWorker([workerArgvMarker, "dummy", "shard-1", "BTC:bitcoin"])

      try {
        await waitFor(() => worker.ticks.some((tick) => tick.symbol === "BTC"), "BTC tick")

        await worker.closeStdin()

        expect(await worker.process.exited).toBe(0)
      } finally {
        worker.process.kill()
      }
    },
    15000
  )

  test(
    "invalid argv marker exits 2 with the reason on stderr",
    async () => {
      const worker = spawnWorker(["not-the-worker-marker", "dummy", "shard-1", "BTC:bitcoin"])

      try {
        expect(await worker.process.exited).toBe(2)
        await waitFor(
          () => worker.stderrText().includes(workerArgvMarker),
          "marker reason on stderr"
        )
      } finally {
        worker.process.kill()
      }
    },
    15000
  )

  test(
    "invalid bootstrap coins exit 2 with the reason on stderr",
    async () => {
      const worker = spawnWorker([workerArgvMarker, "dummy", "shard-1", "BTC"])

      try {
        expect(await worker.process.exited).toBe(2)
        await waitFor(
          () => worker.stderrText().includes("invalid bootstrap coins"),
          "bootstrap reason on stderr"
        )
      } finally {
        worker.process.kill()
      }
    },
    15000
  )
})
