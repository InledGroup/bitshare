import React, { useEffect, useState } from 'react';
import { getWebTorrentClient } from '../lib/webtorrent';
import { importKey, decryptFile, decodePayload } from '../lib/crypto';
import { Progress } from './ui/progress';
import {
  DownloadCloud,
  File as FileIcon,
  Loader2,
  AlertCircle,
  Lock,
  CheckCircle2,
  Users,
  EyeOff,
  ShieldAlert
} from 'lucide-react';

interface DownloadProps {
  shareId?: string;
}

export default function Download({ shareId }: DownloadProps) {
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [peers, setPeers] = useState(0);
  const [decryptionStatus, setDecryptionStatus] = useState('');

  useEffect(() => {
    function loadMetadataFromHash() {
      try {
        const hash = window.location.hash.substring(1);
        if (!hash) {
          throw new Error("Missing file information in the link. Make sure you copied the full URL.");
        }

        const data = decodePayload(hash);
        if (!data) {
          throw new Error("The link is invalid or corrupted.");
        }

        setMetadata(data);
      } catch (err: any) {
        setError(err.message || 'Failed to process file details.');
      } finally {
        setLoading(false);
      }
    }

    loadMetadataFromHash();
  }, []);

  const startDownload = async () => {
    if (!metadata || !metadata.magnetURI) return;

    setDownloading(true);
    setError('');

    try {
      const client = await getWebTorrentClient();
      if (!client) throw new Error("WebTorrent client not available.");

      // Listen to client-wide errors
      client.on('error', (err: any) => {
        console.error("WebTorrent client error:", err);
        const msg = err.message || String(err);
        if (msg.toLowerCase().includes('ice') || msg.toLowerCase().includes('webrtc')) {
          setError("WebRTC: ICE failed. Direct connection blocked by NAT/Firewall. A TURN server is required. See about:webrtc for more details.");
        }
      });

      client.add(metadata.magnetURI, (torrent: any) => {
        const file = torrent.files[0];

        torrent.on('download', () => {
          setProgress(Math.round(torrent.progress * 100));
          setPeers(torrent.numPeers);
        });

        torrent.on('wire', () => setPeers(torrent.numPeers));

        torrent.on('error', (err: any) => {
          console.error("Torrent error:", err);
          const msg = err.message || String(err);
          if (msg.toLowerCase().includes('ice') || msg.toLowerCase().includes('webrtc')) {
            setError("WebRTC: ICE failed. Direct connection blocked by NAT/Firewall. A TURN server is required. See about:webrtc for more details.");
          }
        });

        torrent.on('warning', (err: any) => {
          console.warn("Torrent warning:", err);
          const msg = err.message || String(err);
          if (msg.toLowerCase().includes('ice') || msg.toLowerCase().includes('webrtc')) {
            setError("WebRTC: ICE failed. Direct connection blocked by NAT/Firewall. A TURN server is required (see about:webrtc for details).");
          }
        });

        // Intercept peer connections to catch ICE failures directly from browser RTCPeerConnection
        torrent.on('peer', (peer: any) => {
          if (peer.conn && peer.conn._pc) {
            const pc = peer.conn._pc;
            const handleIceFailure = () => {
              if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') {
                setError("WebRTC: ICE failed. Direct connection blocked by NAT/Firewall. A TURN server is required (see about:webrtc for details).");
              }
            };
            pc.addEventListener('iceconnectionstatechange', handleIceFailure);
            pc.addEventListener('connectionstatechange', handleIceFailure);
          }
        });

        torrent.on('done', async () => {
          setProgress(100);
          setDecryptionStatus('Decrypting file locally...');
          try {
            let encryptedBuffer: ArrayBuffer;
            if (typeof file.arrayBuffer === 'function') {
              encryptedBuffer = await file.arrayBuffer();
            } else if (typeof file.blob === 'function') {
              const b = await file.blob();
              encryptedBuffer = await b.arrayBuffer();
            } else {
              encryptedBuffer = await new Promise((resolve, reject) => {
                file.getBuffer((err: any, buf: any) => {
                  if (err) reject(err);
                  else resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
                });
              });
            }

            const key = await importKey(metadata.key);
            const iv = new Uint8Array(atob(metadata.iv).split("").map(c => c.charCodeAt(0)));
            const decryptedData = await decryptFile(encryptedBuffer, key, iv);
            const blob = new Blob([decryptedData], { type: metadata.type || 'application/octet-stream' });

            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            setDownloading(false);
            setDecryptionStatus('');

            // Trigger local download
            const a = document.createElement('a');
            a.href = url;
            a.download = metadata.name;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => document.body.removeChild(a), 100);
          } catch (err: any) {
            console.error(err);
            setError("Decryption failed. Check that the link is complete.");
            setDownloading(false);
          }
        });
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect to the P2P network.");
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-xl mx-auto p-12 text-center flex flex-col items-center border border-zinc-800 bg-[#070709]/90 backdrop-blur-md rounded-none shadow-xl">
        <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
        <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase font-mono">Loading secure details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-xl mx-auto p-8 text-center border border-zinc-800 bg-[#070709]/90 backdrop-blur-md rounded-none shadow-xl font-mono">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-sm font-bold text-white uppercase mb-2 tracking-wider">Link Error</h2>
        <p className="text-xs text-zinc-400 leading-relaxed mb-6">{error}</p>
        <a href="/" className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-850 hover:border-cyan-500 hover:text-cyan-400 text-xs font-bold tracking-widest uppercase transition-all rounded-none">
          Back to Home
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto border border-zinc-800 bg-[#070709]/90 backdrop-blur-md rounded-none shadow-xl font-mono text-zinc-300">

      {/* Top Header Bar */}
      <div className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/60 flex justify-between items-center">
        <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">Download File</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-none bg-cyan-500 animate-pulse"></span>
          <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">P2P</span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="text-center">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Oh, look, a file!</h2>
          <p className="text-[10px] text-zinc-500 mt-1 max-w-xs mx-auto leading-relaxed">
            We have found the file corresponding to this link. The file is encrypted, and you will download it directly from the sender's computer. Don't worry; we will decrypt it and have it ready for you.
          </p>
        </div>

        <div className="p-4 border border-zinc-800 bg-zinc-950/30 flex items-center space-x-4 rounded-none">
          <div className="p-2 border border-zinc-800 bg-black text-cyan-400 rounded-none">
            <FileIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 overflow-hidden">
            <h3 className="text-xs font-bold text-zinc-300 truncate" title={metadata?.name}>{metadata?.name}</h3>
            <p className="text-[10px] text-zinc-500 font-bold mt-0.5">{(metadata?.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        </div>

        <div className="border border-yellow-950/50 bg-yellow-950/5 p-4 text-xs text-yellow-500/90 space-y-1 rounded-none flex items-start gap-2.5 leading-relaxed font-mono">
          <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
          <span>
            <strong>Security Warning:</strong> Always verify the sender before downloading. Since this is a zero-knowledge P2P channel, we do not scan, inspect, or verify any files. Downloading files from unknown sources puts your device at risk.
          </span>
        </div>

        <div>
          {!downloading && !downloadUrl && (
            <button
              onClick={startDownload}
              className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black uppercase tracking-widest transition-all rounded-none shadow-lg shadow-cyan-500/5 active:scale-95 flex items-center justify-center gap-2"
            >
              <DownloadCloud className="w-4 h-4 animate-pulse" />
              Decrypt & Download
            </button>
          )}

          {downloading && (
            <div className="space-y-4 border border-zinc-800 p-4 bg-zinc-950/20 rounded-none">
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-zinc-500 flex items-center gap-1.5 uppercase">
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  {decryptionStatus || 'Downloading from peer...'}
                </span>
                <span className="text-cyan-400">{progress}%</span>
              </div>

              <Progress value={progress} />

              <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-cyan-500" />
                  {peers} Connected Peers
                </span>
                <span>Keep this tab open</span>
              </div>
            </div>
          )}

          {downloadUrl && (
            <div className="border border-cyan-500 bg-cyan-950/10 p-6 text-center rounded-none animate-in slide-in-from-bottom-2 duration-300">
              <CheckCircle2 className="w-12 h-12 text-cyan-400 mx-auto mb-3 animate-pulse" />
              <h4 className="text-sm font-black text-white uppercase tracking-wider mb-1">Transfer Complete</h4>
              <p className="text-xs text-zinc-450 max-w-xs mx-auto leading-relaxed">
                The file has been decrypted and saved to your device. You can now close this tab. The sender was notified directly via the P2P connection.
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mb-6 p-4 border border-red-900/50 bg-red-950/10 text-red-500 text-xs flex items-center animate-in shake-2 duration-300 rounded-none">
          <ShieldAlert className="w-4 h-4 mr-3 shrink-0" />
          <span className="font-bold">{error}</span>
        </div>
      )}

      <div className="border-t border-zinc-800 px-6 py-4 bg-zinc-950/45 text-[10px] text-zinc-500 space-y-2.5 leading-relaxed rounded-none font-mono">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
          <span>
            <strong>P2P Notice:</strong> Privacy blockers, adblockers, or browser shields (like Brave Shields) frequently block WebRTC. Disable them if the transfer fails.
          </span>
        </div>
        <div className="border-t border-zinc-850 pt-2.5 space-y-1.5 pl-6.5">
          <p>
            <strong>CGNAT & VPN Limitations:</strong> Direct peer-to-peer connection requires public IP hole punching (STUN). If either peer is behind a strict VPN (like Cloudflare WARP) or if <strong>both</strong> peers are behind CGNAT (such as sharing from Mobile Data to Mobile Data), direct WebRTC signaling will be blocked.
          </p>
          <p>
            <strong>The Solution:</strong> In double-CGNAT or strict firewall setups, a TURN server is required to relay the encrypted stream. Since your files are encrypted locally with AES-GCM-256 before leaving your browser, the relayed packets remain 100% secure and unreadable by the relay operator.
          </p>
        </div>
      </div>
    </div>
  );
}
