export async function generateKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function importKey(keyStr: string): Promise<CryptoKey> {
  const binary = atob(keyStr.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  
  return await window.crypto.subtle.importKey(
    "raw",
    bytes,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptFile(file: File, key: CryptoKey): Promise<{iv: Uint8Array, data: ArrayBuffer}> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    fileBuffer
  );
  
  return { iv, data: encryptedData };
}

export async function decryptFile(encryptedData: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encryptedData
  );
}

export function encodePayload(data: { name: string; size: number; type: string; magnetURI: string; iv: string; key: string }): string {
  const obj = {
    n: data.name,
    s: data.size,
    t: data.type,
    m: data.magnetURI,
    i: data.iv,
    k: data.key
  };
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function decodePayload(str: string): { name: string; size: number; type: string; magnetURI: string; iv: string; key: string } | null {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const json = decodeURIComponent(escape(atob(base64)));
    const obj = JSON.parse(json);
    return {
      name: obj.n,
      size: obj.s,
      type: obj.t,
      magnetURI: obj.m,
      iv: obj.i,
      key: obj.k
    };
  } catch (e) {
    console.error("Payload decoding failed:", e);
    return null;
  }
}