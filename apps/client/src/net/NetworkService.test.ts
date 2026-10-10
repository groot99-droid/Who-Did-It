import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = new Map<string, string>();
  return { store, failConnect: { value: false }, lastRoom: { current: null as FakeRoom | null } };
});

interface FakeRoom {
  roomId: string;
  sessionId: string;
  reconnectionToken: string;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
  onLeave: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
}

vi.mock("@colyseus/sdk", () => {
  const makeRoom = (roomId: string): FakeRoom => {
    const room: FakeRoom = {
      roomId,
      sessionId: "me",
      reconnectionToken: `tok-${roomId}`,
      send: vi.fn(),
      leave: vi.fn(async () => 1000),
      onMessage: vi.fn(),
      onLeave: vi.fn(),
      onError: vi.fn(),
    };
    hoisted.lastRoom.current = room;
    return room;
  };
  class Client {
    async create() {
      if (hoisted.failConnect.value) throw new Error("boom");
      return makeRoom("ABCDE");
    }
    async joinById(id: string) {
      if (hoisted.failConnect.value) throw new Error("not found");
      return makeRoom(id);
    }
    async reconnect(token: string) {
      if (hoisted.failConnect.value) throw new Error("stale");
      return makeRoom(token.replace("tok-", ""));
    }
  }
  const noop = () => () => undefined;
  return { Client, Callbacks: { get: () => ({ onAdd: noop, onRemove: noop, onChange: noop, listen: noop }) } };
});

import { ColyseusNetwork, JoinError } from "./NetworkService";
import { JOIN_FAILED_MESSAGE } from "./protocol";
import { reconnectTokens } from "./storage";

beforeEach(() => {
  hoisted.store.clear();
  hoisted.failConnect.value = false;
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => hoisted.store.get(k) ?? null,
    setItem: (k: string, v: string) => void hoisted.store.set(k, v),
    removeItem: (k: string) => void hoisted.store.delete(k),
  });
  vi.stubGlobal("crypto", { randomUUID: () => "device-uuid-0001" });
});

describe("ColyseusNetwork", () => {
  it("stores the reconnection token keyed by room code after create", async () => {
    const net = new ColyseusNetwork();
    await expect(net.create("Ada")).resolves.toBe("ABCDE");
    expect(reconnectTokens.get("ABCDE")).toBe("tok-ABCDE");
  });

  it("upper-cases the code on join", async () => {
    const net = new ColyseusNetwork();
    await expect(net.join("k7m2p", "Bo")).resolves.toBe("K7M2P");
  });

  it("maps every failure to the one generic join error", async () => {
    hoisted.failConnect.value = true;
    const net = new ColyseusNetwork();
    await expect(net.join("K7M2P", "Bo")).rejects.toBeInstanceOf(JoinError);
    await expect(net.create("Bo")).rejects.toThrow(JOIN_FAILED_MESSAGE);
  });

  it("clears the token on consented leave", async () => {
    const net = new ColyseusNetwork();
    await net.create("Ada");
    const left = vi.fn();
    net.bus.on("left", left);
    await net.leave();
    expect(reconnectTokens.get("ABCDE")).toBeNull();
    expect(left).toHaveBeenCalledWith({ consented: true });
  });

  it("resume uses the stored token and drops it when stale", async () => {
    reconnectTokens.set("ABCDE", "tok-ABCDE");
    const net = new ColyseusNetwork();
    await expect(net.resume("ABCDE")).resolves.toBe(true);

    hoisted.failConnect.value = true;
    await expect(net.resume("ABCDE")).resolves.toBe(false);
    expect(reconnectTokens.get("ABCDE")).toBeNull();
  });

  it("resume is false without a token", async () => {
    await expect(new ColyseusNetwork().resume("ZZZZZ")).resolves.toBe(false);
  });

  it("sends typed messages through the room", async () => {
    const net = new ColyseusNetwork();
    await net.create("Ada");
    net.send("role.ready", {});
    expect(hoisted.lastRoom.current?.send).toHaveBeenCalledWith("role.ready", {});
  });

  it("clears the token when gameOver arrives", async () => {
    const net = new ColyseusNetwork();
    await net.create("Ada");
    const room = hoisted.lastRoom.current;
    const handler = room?.onMessage.mock.calls.find((c) => c[0] === "gameOver")?.[1] as (p: unknown) => void;
    handler({ winner: 0, roles: {}, summary: "" });
    expect(reconnectTokens.get("ABCDE")).toBeNull();
  });
});
