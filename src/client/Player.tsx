import React, { useEffect, useRef, useState } from 'react';

// 1. XOR Decrypt (Reversing user's salt + XOR encode)
export function xorDecrypt(base64Str: string) {
  try {
    let b64 = base64Str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const str = atob(b64);
    const packed = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) packed[i] = str.charCodeAt(i);

    if (packed.length === 0) return "";
    const salt = packed[0];
    const data = [];
    for (let i = 1; i < packed.length; i++) {
      // & 0xFF to ensure we are cleanly in byte ranges
      data.push((packed[i] ^ (salt + ((i - 1) * 37) % 256)) & 0xFF);
    }
    return new TextDecoder().decode(new Uint8Array(data));
  } catch(e) {
    console.error("Decryption error", e);
    return "";
  }
}

// 2. XOR Encrypt
export function xorEncrypt(dataStr: string, salt = Math.floor(Math.random() * 256)) {
  const data = new TextEncoder().encode(dataStr);
  const packed = [salt];
  for (let i = 0; i < data.length; i++) {
    // & 0xFF ensures valid character code representation for btoa without DOM exceptions
    packed.push((data[i] ^ (salt + (i * 37) % 256)) & 0xFF);
  }
  return btoa(String.fromCharCode(...packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function Player() {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [config, setConfig] = useState<any>({});
  const jwPlayerInstance = useRef<any>(null);
  
  useEffect(() => {
    const path = window.location.pathname;
    let rawQuery = window.location.search;
    
    const pathParts = path.split('/');
    if (pathParts.length > 2 && pathParts[2]) {
      const decoded = xorDecrypt(pathParts[2]);
      if (decoded) {
        rawQuery = "?" + decoded;
      }
    }

    const params = new URLSearchParams(rawQuery);
    
    let hlsVal = params.get('hls');
    let subVal = params.get('subtitle');
    let introVal = params.get('intro');
    let outroVal = params.get('outro');
    let autoSkipVal = params.get('autoskip') === 'true';
    
    // Fallback if no HLS is provided (direct /stream visit)
    if (!hlsVal) {
      hlsVal = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"; // Big Buck Bunny
      // Data URI for a mock English WebVTT file
      subVal = "[English]data:text/vtt;base64,V0VCVlRUDQoNCjAwOjAwOjAxLjAwMCAtPiAwMDowMDoxMC4wMDANClRoaXMgaXMgYSBkZWZhdWx0IHN1YnRpdGxlIGZvciB0ZXN0aW5nIQ==";
      introVal = "12,25";
      outroVal = "570,596";
      autoSkipVal = false;
    }

    const parsedConfig = {
      hls: hlsVal,
      subtitle: subVal || '',
      intro: introVal || '',
      outro: outroVal || '',
      autoskip: autoSkipVal,
      start: parseInt(params.get('start') || '0', 10)
    };
    setConfig(parsedConfig);
  }, []);

  useEffect(() => {
    if (!config.hls || !playerContainerRef.current) return;
    
    const loadJWPlayer = () => {
      // Subtitle parsing
      const tracks: Array<{kind: string, file: string, label: string, default?: boolean}> = [];
      if (config.subtitle) {
        const regex = /\[(.*?)\]([^,]+)/g;
        let match;
        let isFirst = true;
        while ((match = regex.exec(config.subtitle)) !== null) {
          tracks.push({
            kind: 'captions',
            label: match[1],
            file: match[2],
            ...(isFirst ? { default: true } : {})
          });
          isFirst = false;
        }
      }

      const win = window as any;
      const player = win.jwplayer(playerContainerRef.current);
      jwPlayerInstance.current = player;

      player.setup({
        file: config.hls,
        tracks: tracks,
        width: "100%",
        height: "100%",
        autostart: false,
        cast: {},
        playbackRateControls: true,
        stretching: "fill",
      });

      player.on('ready', () => {
        const svgRewind = '<svg viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16zm4.28-1.76c0 .32-.03.6-.1.82-.07.23-.17.42-.3.57-.13.15-.3.26-.51.34-.21.08-.45.12-.72.12-.28 0-.52-.04-.73-.12-.21-.08-.39-.19-.52-.34-.14-.15-.24-.34-.31-.57-.07-.22-.11-.5-.11-.82v-.74c0-.32.03-.6.1-.82.07-.23.18-.42.31-.57.13-.15.3-.26.52-.34.21-.08.45-.12.73-.12.27 0 .51.04.72.12.21.08.38.19.51.34.13.15.23.34.3.57.07.22.1.5.1.82v.74zm-.85-.86c0-.19-.01-.35-.04-.48-.03-.13-.08-.24-.14-.32-.06-.08-.14-.14-.24-.18-.1-.04-.22-.06-.36-.06-.14 0-.25.02-.35.06-.1.04-.18.1-.24.18-.06.08-.11.19-.14.32-.03.13-.05.29-.05.48v.97c0 .19.02.35.05.48.03.13.08.24.14.32.06.08.14.14.24.18.1.04.22.06.35.06.14 0 .26-.02.36-.06.1-.04.18-.1.24-.18.06-.08.11-.19.14-.32.03-.13.04-.29.04-.48v-.97z"/></svg>';
        const svgForward = '<svg viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M4 13c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8v4l-5-5 5-5v4c4.42 0 8 3.58 8 8s-3.58 8-8 8-8-3.58-8-8h2zm6.9-3.26V16h.85v-6.26h-.09l-1.77.63v.69l1.01-.31zm4.28 1.5c-.13-.15-.3-.26-.51-.34-.21-.08-.45-.12-.72-.12-.28 0-.52.04-.73.12-.21.08-.39.19-.52.34-.14.15-.24.34-.31.57-.07.22-.11.5-.11.82v.74c0 .32.03.6.1.82.07.23.18.42.31.57.13.15.3.26.52.34.21.08.45.12.73-.12.27 0 .51-.04.72-.12.21-.08.38-.19.51-.34.13-.15.23-.34.3-.57.07-.22.1-.5.1-.82v-.74c0-.32-.03-.6-.1-.82-.07-.23-.17-.42-.3-.57zm-.85 1.83c0 .19-.02.35-.05.48-.03.13-.08.24-.14.32-.06.08-.14.14-.24.18-.1.04-.22.06-.35.06-.14 0-.25-.02-.35-.06-.1-.04-.18-.1-.24-.18-.06-.08-.11-.19-.14-.32-.03-.13-.05-.29-.05-.48v-.97c0-.19.02-.35.05-.48.03-.13.08-.24.14-.32.06-.08.14-.14.24-.18.1-.04.22-.06.36-.06.14 0 .26.02.36.06.1.04.18.1.24.18.06.08.11.19.14.32.03.13.04.29.04.48v.97z"/></svg>';

        player.addButton(svgRewind, 'Rewind 10s', () => {
           player.seek(Math.max(0, player.getPosition() - 10));
        }, 'rw10');
        
        player.addButton(svgForward, 'Forward 10s', () => {
           player.seek(player.getPosition() + 10);
        }, 'ff10');
      });

      // Seek to start time
      if (config.start > 0) {
        player.once('play', () => {
          player.seek(config.start);
        });
      }

      // Skip logic & postMessage
      let introStart = 0, introEnd = 0, outroStart = 0, outroEnd = 0;
      if (config.intro) {
        const parts = config.intro.split(',');
        introStart = parseInt(parts[0], 10);
        introEnd = parseInt(parts[1], 10);
      }
      if (config.outro) {
        const parts = config.outro.split(',');
        outroStart = parseInt(parts[0], 10);
        outroEnd = parseInt(parts[1], 10);
      }

      let highlightsAdded = false;

      player.on('time', (e: any) => {
        const time = e.position;
        const duration = e.duration;
         
        // Inject yellow timeline highlights once duration is known
        if (!highlightsAdded && duration > 0) {
            const slider = playerContainerRef.current?.querySelector('.jw-slider-time');
            if (slider) {
                highlightsAdded = true;
                const addHighlight = (start: number, end: number, label: string) => {
                    if (end <= start) return;
                    const left = (start / duration) * 100;
                    const width = ((end - start) / duration) * 100;
                    
                    const hl = document.createElement('div');
                    hl.className = 'custom-highlight';
                    hl.style.position = 'absolute';
                    hl.style.left = left + '%';
                    hl.style.width = width + '%';
                    hl.style.height = '100%';
                    hl.style.backgroundColor = '#facc15'; // yellow-400
                    hl.style.opacity = '0.8';
                    hl.style.zIndex = '1';
                    hl.style.pointerEvents = 'none';

                    const lbl = document.createElement('div');
                    lbl.innerText = label;
                    lbl.style.position = 'absolute';
                    lbl.style.top = '-18px';
                    lbl.style.fontSize = '10px';
                    lbl.style.color = '#facc15';
                    lbl.style.fontWeight = 'bold';
                    lbl.style.textShadow = '0px 1px 2px rgba(0,0,0,0.8)';
                    hl.appendChild(lbl);

                    slider.appendChild(hl);
                };

                if (introEnd > introStart) addHighlight(introStart, introEnd, 'Intro');
                if (outroEnd > outroStart) addHighlight(outroStart, outroEnd, 'Outro');
            }
        }

        let shouldSkip = false;
        let targetTime = 0;

        if (introEnd > introStart && time >= introStart && time <= introEnd) {
            if (config.autoskip) {
                shouldSkip = true;
                targetTime = introEnd;
            } else {
                setShowSkipIntro(true);
            }
        } else {
            setShowSkipIntro(false);
        }

        if (outroEnd > outroStart && time >= outroStart && time <= outroEnd) {
            if (config.autoskip) {
                shouldSkip = true;
                targetTime = outroEnd;
            }
        }

        if (shouldSkip) {
            player.seek(targetTime);
        }

        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'timeupdate',
                currentTime: time,
                duration: duration
            }, '*');
        }
      });

      player.on('complete', () => {
         if (window.parent && window.parent !== window) {
             window.parent.postMessage({ type: 'ended' }, '*');
         }
      });
    };

    if (!(window as any).jwplayer) {
      const script = document.createElement('script');
      // Using an open CDN endpoint for JW Player 8 without license lock
      script.src = 'https://content.jwplatform.com/libraries/KB5zFt7A.js';
      script.async = true;
      script.onload = loadJWPlayer;
      document.body.appendChild(script);
    } else {
      loadJWPlayer();
    }

    return () => {
      if (jwPlayerInstance.current) {
        jwPlayerInstance.current.remove();
        jwPlayerInstance.current = null;
      }
    };
  }, [config]);

  const handleSkipIntro = () => {
     if (jwPlayerInstance.current && config.intro) {
        const end = parseInt(config.intro.split(',')[1], 10);
        jwPlayerInstance.current.seek(end);
     }
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative">
      <style>{`
        body { margin: 0; padding: 0; background: black; }
        .jwplayer { height: 100vh !important; width: 100vw !important; }
      `}</style>
      
      {config.hls ? (
         <div ref={playerContainerRef} className="w-full h-full" id="jwplayer-container"></div>
      ) : (
         <div className="flex items-center justify-center w-full h-full text-white font-sans text-xl">
            Initializing or no stream config...
         </div>
      )}
      
      {showSkipIntro && !config.autoskip && (
         <button 
           onClick={handleSkipIntro}
           className="absolute bottom-24 right-8 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded border border-white/20 z-50 font-medium transition-all"
         >
           Skip Intro
         </button>
      )}
    </div>
  );
}
