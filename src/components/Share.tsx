import React, { useState, useCallback, useEffect } from 'react';
import { getWebTorrentClient } from '../lib/webtorrent';
import { generateKey, exportKey, encryptFile, encodePayload } from '../lib/crypto';
import { Progress } from './ui/progress';
import {
  UploadCloud,
  Copy,
  CheckCircle,
  File as FileIcon,
  Loader2,
  Lock,
  ShieldCheck,
  ShieldAlert,
  PartyPopper,
  RefreshCw,
  EyeOff
} from 'lucide-react';

export default function Share() {
  const [file, setFile] = useState<File | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [encryptionStatus, setEncryptionStatus] = useState('');
  const [downloadFinished, setDownloadFinished] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activePeers, setActivePeers] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [activeTorrent, setActiveTorrent] = useState<any>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Clean up torrent on unmount
  useEffect(() => {
    return () => {
      if (activeTorrent) {
        try {
          activeTorrent.destroy();
        } catch(e) {}
      }
    };
  }, [activeTorrent]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleShare = async () => {
    if (!file) return;
    setIsSeeding(true);
    setError('');
    setEncryptionStatus('Encrypting file locally...');

    try {
      const key = await generateKey();
      const { iv, data } = await encryptFile(file, key);
      const keyStr = await exportKey(key);
      const ivStr = btoa(String.fromCharCode(...iv));

      setEncryptionStatus('Initializing P2P swarm...');
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

      const encryptedBlob = new Blob([data], { type: 'application/octet-stream' });

      client.seed(encryptedBlob, { name: file.name + '.encrypted' }, (torrent: any) => {
        try {
          setActiveTorrent(torrent);

          const payload = encodePayload({
            name: file.name,
            size: file.size,
            type: file.type,
            magnetURI: torrent.magnetURI,
            iv: ivStr,
            key: keyStr
          });

          const link = `${window.location.origin}/download/#${payload}`;
          setShareLink(link);
          setEncryptionStatus('');

          // Error and warning handlers on the torrent
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

          // Monitor WebRTC upload progress
          torrent.on('upload', () => {
            setUploadedBytes(torrent.uploaded);
            setActivePeers(torrent.numPeers);

            if (torrent.uploaded >= file.size) {
              setDownloadFinished(true);
              try { new Audio('/success.mp3').play(); } catch(e) {}
            }
          });

          torrent.on('wire', () => {
            setActivePeers(torrent.numPeers);
          });

          const peerInterval = setInterval(() => {
            if (torrent.peers && torrent.peers.length > 0) {
              const completedPeer = torrent.peers.find(
                (p: any) => p.progress === 1 || p.downloaded === torrent.length
              );
              if (completedPeer) {
                setDownloadFinished(true);
                clearInterval(peerInterval);
                try { new Audio('/success.mp3').play(); } catch(e) {}
              }
            }
            if (torrent.destroyed) {
              clearInterval(peerInterval);
            }
          }, 1500);

        } catch (err: any) {
          console.error(err);
          setError("Failed to initialize P2P transmission.");
          setIsSeeding(false);
        }
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to encrypt the file.");
      setIsSeeding(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-xl mx-auto border border-zinc-800 bg-[#070709]/90 backdrop-blur-md rounded-none shadow-xl font-mono text-zinc-300">

      {/* Top Header Bar */}
      <div className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/60 flex justify-between items-center">
        <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">Share File</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-none bg-cyan-500 animate-pulse"></span>
          <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">P2P</span>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {!shareLink && !isSeeding && (
          <>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`border border-dashed p-10 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer rounded-none relative overflow-hidden ${
                isDragging
                  ? 'border-cyan-500 bg-cyan-950/10'
                  : 'border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/10 hover:border-zinc-700'
              }`}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input id="file-input" type="file" className="hidden" onChange={handleFileChange} />
              <div className="p-3 border border-zinc-800 bg-black text-zinc-500 mb-4 rounded-none">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-450 text-center">
                Drag and drop a file or click to browse
              </p>
              <p className="text-[10px] text-zinc-500 mt-2 font-mono flex items-center gap-1">
                <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
                Files are encrypted locally on your device before transfer
              </p>
            </div>

            {file && (
              <div className="border border-zinc-800 p-4 bg-zinc-950/40 flex items-center justify-between rounded-none animate-in fade-in duration-200">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2 border border-zinc-800 bg-black text-cyan-400 rounded-none">
                    <FileIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-300 truncate">{file.name}</p>
                    <p className="text-[10px] text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-[10px] font-black uppercase tracking-wider text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-900/50 bg-black px-3 py-1.5 rounded-none transition-all"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="border border-zinc-800 p-4 bg-zinc-950/40 text-xs space-y-3 rounded-none font-mono">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-850 pb-1.5">// P2P Terms & Disclaimer</span>
              <p className="text-zinc-500 text-[10px] leading-relaxed">
                Bitshare is a zero-knowledge, non-cloud peer-to-peer file sharing tool. No files or metadata are stored or processed on our servers. You are solely responsible for the files you send. You agree not to use this service for any illegal activities; we are not here for that, act like adults.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer text-zinc-350 select-none hover:text-cyan-400 transition-colors">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 border-zinc-800 bg-black text-cyan-500 focus:ring-0 focus:ring-offset-0 focus:outline-none rounded-none cursor-pointer"
                />
                <span className="text-[11px] font-bold">I accept the terms and agree not to send illegal files.</span>
              </label>
            </div>

            <button
              onClick={handleShare}
              disabled={!file || !acceptedTerms}
              className={`w-full py-3.5 font-bold uppercase tracking-widest text-xs rounded-none transition-all duration-200 flex items-center justify-center gap-2 ${
                file && acceptedTerms
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/5'
                  : 'bg-zinc-900 text-zinc-600 border border-zinc-850 cursor-not-allowed'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Generate Share Link
            </button>
          </>
        )}

        {isSeeding && !shareLink && (
          <div className="text-center flex flex-col items-center py-8 animate-in fade-in duration-200">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
            <p className="text-xs font-bold tracking-widest text-zinc-400">{encryptionStatus}</p>
            <p className="text-[10px] text-zinc-500 mt-2 max-w-xs leading-relaxed">
              Encrypting your file and establishing a direct connection. No data is uploaded to a cloud server.
            </p>
          </div>
        )}

        {shareLink && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {downloadFinished ? (
              <div className="border border-cyan-500 bg-cyan-950/10 p-6 text-center rounded-none relative overflow-hidden">
                <PartyPopper className="w-12 h-12 text-cyan-400 mx-auto mb-3" />
                <h3 className="text-lg font-black text-white uppercase mb-1 tracking-wider">Transfer Complete</h3>
                <p className="text-xs text-zinc-450 mb-6 max-w-sm mx-auto leading-relaxed">
                  The recipient has successfully downloaded and decrypted the file directly from your browser. You can now close this tab.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold uppercase tracking-widest transition-all rounded-none mx-auto flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Share Another File
                </button>
              </div>
            ) : (
              <div className="border border-zinc-800 p-6 bg-zinc-950/20 rounded-none relative">

                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-3">
                  <span className="w-1.5 h-1.5 bg-emerald-500 animate-pulse"></span>
                  <span>Active Seeding // Keep this tab open</span>
                </div>

                <h3 className="text-sm font-bold text-white uppercase mb-2 tracking-wider">Share Link Ready</h3>
                <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
                  Send this link to the recipient. The transfer will fail if you close this tab or turn off your device.
                </p>

                <div className="flex bg-black border border-zinc-800 p-1.5 rounded-none mb-4">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    className="flex-1 bg-transparent text-xs text-cyan-400 font-mono focus:outline-none px-2 truncate"
                  />
                  <button
                    onClick={copyToClipboard}
                    className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-none transition-all ${
                      copied
                        ? 'bg-emerald-500 text-white'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-black'
                    }`}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="border-t border-zinc-850 pt-4 space-y-2 text-[10px] text-zinc-500 font-mono">
                  <div className="flex justify-between">
                    <span>File: <strong className="text-zinc-400">{file?.name}</strong></span>
                    <span>Size: <strong className="text-zinc-400">{(file!.size / 1024 / 1024).toFixed(2)} MB</strong></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Connected Peers: <strong className="text-cyan-400">{activePeers}</strong></span>
                    <span>Uploaded: <strong className="text-cyan-400">{(uploadedBytes / 1024 / 1024).toFixed(2)} MB ({Math.min(100, Math.round((uploadedBytes / file!.size) * 100))}%)</strong></span>
                  </div>
                </div>
              </div>
            )}

            {!downloadFinished && (
              <div className="text-center mt-4">
                <button
                  onClick={() => window.location.reload()}
                  className="text-[10px] text-zinc-500 hover:text-red-500 font-bold uppercase tracking-widest transition-colors"
                >
                  Cancel sharing
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-6 mb-6 p-4 border border-red-900/50 bg-red-950/10 text-red-500 text-xs flex items-center animate-in shake-2 duration-300 rounded-none">
          <ShieldAlert className="w-4 h-4 mr-3 shrink-0" />
          <span className="font-bold">{error}</span>
        </div>
      )}

      <div className="border-t border-zinc-800 px-6 py-3.5 bg-zinc-950/40 text-[10px] text-zinc-500 flex items-start gap-2.5 leading-relaxed rounded-none">
        <ShieldAlert className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
        <span>
          <strong>Anticipate errors:</strong> If the connection fails or stays at 0 peers, try disabling adblockers, privacy extensions, or browser shields (such as Brave Shields) which can block WebRTC connections.
        </span>
      </div>
    </div>
  );
}
