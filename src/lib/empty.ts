// Mock file to bypass WebTorrent dependencies during SSR build
export const Client = class {};
export const Tracker = class {};
export const DHT = class {};
export const Protocol = class {};
export default {
  Client: class {},
  Tracker: class {},
  DHT: class {},
  Protocol: class {}
};