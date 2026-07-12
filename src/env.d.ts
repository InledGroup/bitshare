/// <reference types="astro/client" />

interface Env {
  BITSHARE_KV: KVNamespace;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
