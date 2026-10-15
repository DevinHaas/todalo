export function rambleSocketUrl(location: Pick<Location, "protocol" | "host" | "hostname">, configured?: string) {
  if (process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(location.hostname)) {
    if (configured) {
      const url = new URL(configured);
      if (["ws:", "wss:"].includes(url.protocol) && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.toString();
      throw new Error("The development Ramble address must be a local WebSocket URL.");
    }
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001/api/ramble/ws`;
  }
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ramble/ws`;
}
