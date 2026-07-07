import { useState, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════════════
// SERAI / SCANNER — Product Reality Check
// 3-flag verdict system · fixed image upload (canvas JPEG re-encode)
// ═══════════════════════════════════════════════════════════

const C = {
  green: "#1F3D2E",
  greenDeep: "#152A20",
  cream: "#F4EFE0",
  navy: "#1A2841",
  brick: "#C66B3D",
  brickDeep: "#A8552C",
  tan: "#B8956A",
  sage: "#A8B89A",
  ink: "rgba(244,239,224,0.75)",
  faint: "rgba(244,239,224,0.5)",
  line: "rgba(244,239,224,0.18)",
  lineBold: "rgba(244,239,224,0.35)",
  surface: "rgba(244,239,224,0.06)",
  surfaceSolid: "rgba(31,61,46,0.85)",
};

const BG_IMAGE = "https://images.unsplash.com/photo-1530176928500-2372a88e00b5?w=1600&q=75&auto=format&fit=crop";

const FLAGS = {
  KEEPER: {
    emoji: "💚",
    label: "KEEPER",
    color: C.sage,
  },
  SKETCHY: {
    emoji: "🤔",
    label: "SKETCHY",
    color: C.tan,
  },
  TOSS: {
    emoji: "💀",
    label: "TOSS IT",
    color: C.brick,
  },
};

const SYSTEM_PROMPT = `You are SERAI / SCANNER — a product reality check for beauty and personal-care products in the Indian market.

INPUT: Either an image of a product label OR a pasted ingredient list.
If image: extract ingredients first, then analyse.

OUTPUT: Pure JSON. No markdown, no backticks, no prose.

SCHEMA:
{
  "extractedIngredients": "comma-separated list if image, else empty string",
  "flag": "KEEPER" | "SKETCHY" | "TOSS",
  "score": number 0-10 (one decimal allowed),
  "punchline": "ONE short editorial line, max 12 words, full sentence",
  "productGuess": "best guess of product category (e.g. \\"Hydrating Serum\\", \\"Body Lotion\\")",
  "theTea": {
    "goodAt": "2 sentences — what this product actually does well, plain English",
    "shadyAbout": "2 sentences — what the marketing is hiding or stretching, plain English"
  },
  "claimsDecoded": [
    {"claim": "their likely claim e.g. 100% Natural", "reality": "1 sentence, plain English"}
  ],
  "watchOut": [
    {"ingredient": "name", "concern": "1 sentence in laymen language"}
  ],
  "heroes": [
    {"ingredient": "name", "why": "1 sentence in laymen language"}
  ],
  "skinGoals": {
    "hydration": 0-10,
    "brightening": 0-10,
    "antiAcne": 0-10,
    "antiAgeing": 0-10,
    "sensitiveSkinSafe": 0-10
  },
  "worksFor": ["3 short bullet phrases"],
  "skipIf": ["2-3 short bullet phrases"]
}

claimsDecoded: 2 to 4 items. watchOut: 0 to 4 items. heroes: 1 to 4 items.

FLAG RULES:
- KEEPER: score 7.0+, formula is clean and effective
- SKETCHY: score 4.0-6.9, formula is mid OR marketing is dishonest
- TOSS: score below 4.0, formula has clear red flags

VOICE:
- Layperson language. NO chemistry jargon.
- Smart, cool, slightly bestie energy. Witty without trying.
- Short sentences. Punchy. No fluff.
- Be observant, not preachy.
- Match the spice to the verdict — KEEPER is warm, SKETCHY is dry, TOSS is brutal but fair.
- No medical claims. No competitor names. No body shaming.
- Indian market context welcome (humidity, melanin, climate) but globally readable.

REFERENCE PUNCHLINES:
"Hydration queen. Fragrance villain."
"More parfum than promise."
"Your barrier deserves better than this."
"Decent formula, dressed up in lies."
"Quietly excellent. Loudly underpriced."
"All cologne, no character."
"₹6,000 for water and good lighting."

APPROACH:
- Don\'t over-flag. 1 in 4 results should be genuinely positive.
- Evidence-backed concerns only.
- Plain English over chemistry: "may mess with hormones" not "endocrine disruption."
- Reward clean formulas with high scores.`;

export default function App() {
  const [stage, setStage] = useState("scan");
  const [mode, setMode] = useState("photo");
  const [ingredients, setIngredients] = useState("");
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);

  // THE FIX: every uploaded image is redrawn onto a canvas and re-exported
  // as a guaranteed-valid JPEG. Handles iPhone HEIC, PNG, weird MIME types.
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1568;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setImage({
          base64: jpegDataUrl.split(",")[1],
          mediaType: "image/jpeg",
          previewUrl: jpegDataUrl,
        });
      };
      img.onerror = () => setError("Couldn\'t read that image. Try a different photo — a screenshot of the label also works.");
      img.src = ev.target.result;
    };
    reader.onerror = () => setError("Couldn\'t read that file.");
    reader.readAsDataURL(file);
  };

  const startAnalysis = () => {
    if (mode === "photo" && !image) return;
    if (mode === "text" && !ingredients.trim()) return;
    runAnalysis();
  };

  const runAnalysis = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      let content;
      if (mode === "photo" && image) {
        setLoadingMsg("Reading the label");
        content = [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
          { type: "text", text: "Photo of a beauty/personal-care product label. Extract ingredients then run a SERAI/SCANNER reality check." },
        ];
      } else {
        setLoadingMsg("Decoding the formula");
        content = `Run a SERAI/SCANNER reality check on these ingredients:\n\n${ingredients}`;
      }

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content }],
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error || data.type === "error") {
        const msg = data?.error?.message || JSON.stringify(data);
        console.error("API error:", data);
        setError(`Something went sideways: ${msg}`);
        setLoading(false); setLoadingMsg("");
        return;
      }

      const raw = data.content?.[0]?.text || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setResult(parsed);
      setStage("result");
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      setError("Couldn\'t parse the response. Try again — or paste the ingredient list manually.");
    } finally {
      setLoading(false); setLoadingMsg("");
    }
  };

  const reset = () => {
    setResult(null); setImage(null); setIngredients("");
    setError(""); setStage("scan"); setMode("photo");
    window.scrollTo(0, 0);
  };

  const flag = result ? (FLAGS[result.flag] || FLAGS.SKETCHY) : null;

  const Wordmark = ({ size = "lg" }) => {
    const S = size === "lg" ? 36 : size === "md" ? 26 : 20;
    const SP = size === "lg" ? 10 : size === "md" ? 7 : 5;
    const SC = size === "lg" ? 54 : size === "md" ? 40 : 32;
    const SL = size === "lg" ? 14 : size === "md" ? 10 : 8;
    return (
      <div style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
        <span style={{
          fontFamily: "\'Libre Caslon Display\', serif",
          fontSize: S, fontWeight: 400, letterSpacing: SP,
          color: C.cream, textTransform: "uppercase", lineHeight: 1,
        }}>Serai</span>
        <span style={{
          fontFamily: "\'Italianno\', cursive",
          fontSize: SC, fontWeight: 400, color: C.brick,
          marginLeft: SL, lineHeight: 1, display: "inline-block",
          position: "relative", top: "0.12em",
        }}>Scanner</span>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.green, color: C.cream,
      fontFamily: "\'DM Sans\', sans-serif", position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url(\'https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Italianno&family=DM+Sans:wght@400;500;600;700;800&display=swap\');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
        ::selection { background: ${C.brick}; color: ${C.cream}; }

        .btn {
          width: 100%; padding: 18px 24px; border: none;
          background: ${C.brick}; color: ${C.cream}; cursor: pointer;
          font-family: \'DM Sans\', sans-serif; font-size: 12px;
          letter-spacing: 3.5px; font-weight: 700;
          transition: all 0.3s ease; text-transform: uppercase;
        }
        .btn:hover:not(:disabled) { background: ${C.brickDeep}; letter-spacing: 4.5px; }
        .btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .ghost {
          background: transparent; border: 1px solid ${C.lineBold};
          color: ${C.ink}; padding: 14px 24px; cursor: pointer;
          font-family: \'DM Sans\', sans-serif; font-size: 11px;
          letter-spacing: 2.5px; transition: all 0.25s; width: 100%;
          font-weight: 600; text-transform: uppercase;
        }
        .ghost:hover { border-color: ${C.cream}; color: ${C.cream}; }

        .pill {
          flex: 1; padding: 14px 8px; background: transparent;
          border: 1px solid ${C.line}; color: ${C.faint};
          font-family: \'DM Sans\', sans-serif; font-size: 11px;
          letter-spacing: 2.5px; cursor: pointer; transition: all 0.25s;
          font-weight: 600; text-transform: uppercase;
        }
        .pill.on { background: ${C.cream}; border-color: ${C.cream}; color: ${C.green}; }

        textarea {
          width: 100%; background: ${C.surface}; border: 1px solid ${C.line};
          color: ${C.cream}; font-family: \'DM Sans\', sans-serif; font-size: 13px;
          line-height: 1.85; padding: 18px; resize: none; outline: none;
          min-height: 130px; backdrop-filter: blur(4px);
        }
        textarea:focus { border-color: ${C.cream}; }
        textarea::placeholder { color: ${C.faint}; }

        .upload {
          border: 1px dashed ${C.lineBold}; background: ${C.surface};
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 56px 24px; cursor: pointer;
          gap: 16px; transition: all 0.3s; backdrop-filter: blur(4px);
        }
        .upload:hover { border-color: ${C.cream}; background: rgba(244,239,224,0.1); }

        .micro {
          font-family: \'DM Sans\', sans-serif; font-size: 10px;
          letter-spacing: 3px; color: ${C.faint};
          font-weight: 700; text-transform: uppercase;
        }

        .section-label {
          font-family: \'DM Sans\', sans-serif; font-size: 11px;
          letter-spacing: 4px; color: ${C.brick};
          font-weight: 800; text-transform: uppercase;
          margin-bottom: 16px;
        }

        @keyframes appear { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .reveal { animation: appear 0.7s cubic-bezier(0.2,0.8,0.3,1) forwards; opacity: 0; }
        .r1 { animation-delay: 0.05s; }
        .r2 { animation-delay: 0.18s; }
        .r3 { animation-delay: 0.32s; }
        .r4 { animation-delay: 0.48s; }
        .r5 { animation-delay: 0.62s; }
        .r6 { animation-delay: 0.76s; }

        @keyframes pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
        .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${C.brick}; animation: pulse 1.4s ease infinite; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes flagIn {
          0% { opacity: 0; transform: scale(0.3); }
          60% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        .flag-emoji { animation: flagIn 0.9s cubic-bezier(0.4,1.6,0.5,1) forwards; }

        .meter-track {
          height: 8px; background: rgba(244,239,224,0.1);
          overflow: hidden; position: relative;
        }
        .meter-fill { height: 100%; transition: width 1s cubic-bezier(0.4,0.8,0.3,1); }

        @media (prefers-reduced-motion: reduce) {
          .reveal, .flag-emoji, .dot, .meter-fill { animation: none; opacity: 1; transition: none; }
        }
      `}</style>

      {/* Background image */}
      <div style={{
        position: "fixed", inset: 0,
        backgroundImage: `url(${BG_IMAGE})`,
        backgroundSize: "cover", backgroundPosition: "center",
        zIndex: 0, filter: "sepia(0.6) saturate(1.25) brightness(0.55) contrast(1.08)",
      }} />
      <div style={{
        position: "fixed", inset: 0,
        background: "linear-gradient(180deg, rgba(24,20,12,0.5) 0%, rgba(24,20,12,0.3) 40%, rgba(21,42,32,0.92) 100%)",
        zIndex: 1, pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 24px 80px", position: "relative", zIndex: 3 }}>

        {/* ════════ SCAN STAGE ════════ */}
        {stage === "scan" && (
          <>
            <div className={mounted ? "reveal r1" : ""} style={{ padding: "56px 0 32px" }}>
              <Wordmark size="lg" />
              <div className="micro" style={{ marginTop: 12, fontSize: 11, letterSpacing: 4 }}>
                Product Reality Check &nbsp;·&nbsp; Est. 2026
              </div>
            </div>

            <div className={mounted ? "reveal r2" : ""} style={{ marginBottom: 44 }}>
              <h1 style={{
                fontFamily: "\'Libre Caslon Display\', serif",
                fontSize: "clamp(42px, 9vw, 68px)",
                fontWeight: 400, lineHeight: 1.05, color: C.cream,
                marginBottom: 22, letterSpacing: "-0.02em",
              }}>
                Reads the back of<br />
                <span style={{
                  fontFamily: "\'Italianno\', cursive", fontSize: "1.2em",
                  color: C.tan, fontWeight: 400, letterSpacing: 0, lineHeight: 0.85,
                }}>the bottle</span><br />
                so you don\'t have to.
              </h1>
              <p style={{ color: C.ink, fontSize: 15, lineHeight: 1.75, maxWidth: 480 }}>
                Snap a label or paste the ingredient list. We tell you what\'s actually inside, what the brand is hiding, and whether your skin should bother — in plain English.
              </p>
            </div>

            <div className={mounted ? "reveal r3" : ""}>
              <div style={{ display: "flex", marginBottom: 16 }}>
                <button className={`pill ${mode === "photo" ? "on" : ""}`} onClick={() => { setMode("photo"); setError(""); }}>
                  Scan · Photo
                </button>
                <button className={`pill ${mode === "text" ? "on" : ""}`} onClick={() => { setMode("text"); setError(""); }} style={{ borderLeft: "none" }}>
                  Paste · List
                </button>
              </div>

              {mode === "photo" && !image && (
                <div className="upload" onClick={() => fileInputRef.current?.click()}>
                  <div style={{
                    fontFamily: "\'Italianno\', cursive", fontSize: 64,
                    color: C.brick, lineHeight: 0.7,
                  }}>+</div>
                  <div style={{
                    fontFamily: "\'Libre Caslon Display\', serif",
                    fontSize: 22, color: C.cream,
                  }}>Capture the label</div>
                  <div className="micro" style={{ fontSize: 9, textAlign: "center", lineHeight: 1.9 }}>
                    Tap to open camera &nbsp;·&nbsp; or choose from gallery
                  </div>
                </div>
              )}

              {mode === "photo" && image && (
                <div style={{ position: "relative" }}>
                  <img src={image.previewUrl} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "cover", border: `1px solid ${C.lineBold}`, display: "block" }} />
                  <button onClick={() => setImage(null)} style={{
                    position: "absolute", top: 12, right: 12,
                    background: C.greenDeep, border: `1px solid ${C.lineBold}`,
                    color: C.cream, width: 32, height: 32, cursor: "pointer", fontSize: 14,
                  }}>✕</button>
                  <div className="micro" style={{ padding: "12px 16px", background: C.surfaceSolid, border: `1px solid ${C.line}`, borderTop: "none", fontSize: 9, color: C.tan }}>
                    Label captured &nbsp;·&nbsp; ready to analyse
                  </div>
                </div>
              )}

              {mode === "text" && (
                <div>
                  <div className="micro" style={{ fontSize: 9, marginBottom: 8 }}>Ingredient List</div>
                  <textarea value={ingredients} onChange={e => setIngredients(e.target.value)}
                    placeholder="Aqua, Glycerin, Niacinamide, Rosa Damascena Flower Water, Dimethicone, Parfum, Methylparaben..." />
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleImageUpload} />

              {error && (
                <div style={{ marginTop: 14, padding: "14px 16px", background: `${C.brick}25`, border: `1px solid ${C.brick}`, color: C.cream, fontSize: 12, lineHeight: 1.7 }}>
                  {error}
                </div>
              )}

              <button className="btn" style={{ marginTop: 16 }} onClick={startAnalysis}
                disabled={loading || (mode === "photo" ? !image : !ingredients.trim())}>
                {loading ? loadingMsg : "Run the Scan"}
              </button>
            </div>

            <div className={mounted ? "reveal r4" : ""} style={{ marginTop: 80, borderTop: `1px solid ${C.line}`, paddingTop: 22, display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "\'Libre Caslon Display\', serif", fontSize: 14, color: C.faint, fontStyle: "italic" }}>
                A free tool from Serai.
              </div>
              <div className="micro" style={{ fontSize: 9, letterSpacing: 3 }}>S/S · 2026</div>
            </div>
          </>
        )}

        {/* ════════ LOADING ════════ */}
        {loading && (
          <div style={{ position: "fixed", inset: 0, background: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28, zIndex: 100 }}>
            <div style={{ fontFamily: "\'Libre Caslon Display\', serif", fontSize: 32, color: C.cream, letterSpacing: "-0.02em" }}>
              {loadingMsg}
              <span style={{ fontFamily: "\'Italianno\', cursive", fontSize: 38, color: C.brick, marginLeft: 6 }}>…</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          </div>
        )}

        {/* ════════ RESULT STAGE ════════ */}
        {stage === "result" && result && flag && (
          <div style={{ paddingTop: 24 }}>

            <div className="reveal r1" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
              <Wordmark size="sm" />
              <div className="micro" style={{ fontSize: 9 }}>
                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>

            {/* HIT 1: THE BIG VERDICT */}
            <div className="reveal r2" style={{
              minHeight: "70vh", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", textAlign: "center",
              padding: "20px 0",
            }}>
              {result.productGuess && (
                <div className="micro" style={{ marginBottom: 24, fontSize: 10 }}>
                  {result.productGuess}
                </div>
              )}

              <div className="flag-emoji" style={{
                fontSize: 140, lineHeight: 1, marginBottom: 16,
                filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.4))",
              }}>{flag.emoji}</div>

              <div style={{
                fontFamily: "\'Libre Caslon Display\', serif",
                fontSize: "clamp(56px, 12vw, 88px)", lineHeight: 1,
                color: flag.color, letterSpacing: "-0.03em",
                fontWeight: 400, marginBottom: 28, fontStyle: "italic",
              }}>
                {flag.label}
              </div>

              <div style={{
                fontFamily: "\'Libre Caslon Display\', serif",
                fontSize: 24, lineHeight: 1.4, color: C.cream,
                maxWidth: 480, fontStyle: "italic", letterSpacing: "-0.01em",
              }}>
                "{result.punchline}"
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 36 }}>
                <span style={{
                  fontFamily: "\'Libre Caslon Display\', serif",
                  fontSize: 72, fontWeight: 400, color: C.cream,
                  letterSpacing: "-0.04em", lineHeight: 0.85,
                }}>{result.score}</span>
                <span style={{
                  fontFamily: "\'Italianno\', cursive", fontSize: 36,
                  color: C.brick,
                }}>/10</span>
              </div>

              <div className="micro" style={{ marginTop: 60, fontSize: 9 }}>
                ↓ &nbsp; The Full Tea Below &nbsp; ↓
              </div>
            </div>

            {/* HIT 2: THE TEA */}
            <div className="reveal r3" style={{ marginTop: 60, marginBottom: 60 }}>
              <div className="section-label">The Tea</div>
              <div style={{ display: "grid", gap: 24 }}>
                <div style={{ background: C.surfaceSolid, padding: "24px 26px", border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.sage}`, backdropFilter: "blur(8px)" }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 800, color: C.sage, marginBottom: 12, textTransform: "uppercase" }}>
                    ✓ &nbsp; What it\'s good at
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: C.cream }}>
                    {result.theTea?.goodAt}
                  </div>
                </div>
                <div style={{ background: C.surfaceSolid, padding: "24px 26px", border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.brick}`, backdropFilter: "blur(8px)" }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 800, color: C.brick, marginBottom: 12, textTransform: "uppercase" }}>
                    ✗ &nbsp; What it\'s being shady about
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: C.cream }}>
                    {result.theTea?.shadyAbout}
                  </div>
                </div>
              </div>
            </div>

            {/* HIT 3: CLAIMS DECODED */}
            {result.claimsDecoded?.length > 0 && (
              <div className="reveal r4" style={{ marginBottom: 60 }}>
                <div className="section-label">Marketing Claims · Decoded</div>
                <div style={{ display: "grid", gap: 16 }}>
                  {result.claimsDecoded.map((c, i) => (
                    <div key={i} style={{ background: C.surfaceSolid, padding: "20px 24px", border: `1px solid ${C.line}`, backdropFilter: "blur(8px)" }}>
                      <div style={{ marginBottom: 8 }}>
                        <span style={{
                          fontFamily: "\'Libre Caslon Display\', serif",
                          fontSize: 18, color: C.tan, fontStyle: "italic",
                        }}>"{c.claim}"</span>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ color: C.brick, fontWeight: 700, fontSize: 18, lineHeight: 1 }}>→</span>
                        <span style={{ fontSize: 14, lineHeight: 1.6, color: C.ink }}>{c.reality}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HIT 4: WATCH OUT + HEROES */}
            {(result.watchOut?.length > 0 || result.heroes?.length > 0) && (
              <div className="reveal r5" style={{ marginBottom: 60 }}>
                <div className="section-label">Ingredient Breakdown</div>
                <div style={{ display: "grid", gap: 24 }}>
                  {result.watchOut?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: 2.5, fontWeight: 800, color: C.brick, marginBottom: 14, textTransform: "uppercase" }}>
                        🚩 &nbsp; Watch out
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {result.watchOut.map((f, i) => (
                          <div key={i} style={{ background: C.surfaceSolid, padding: "16px 20px", border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.brick}`, backdropFilter: "blur(8px)" }}>
                            <div style={{ fontFamily: "\'Libre Caslon Display\', serif", fontSize: 18, color: C.cream, marginBottom: 4 }}>
                              {f.ingredient}
                            </div>
                            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>{f.concern}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.heroes?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: 2.5, fontWeight: 800, color: C.sage, marginBottom: 14, textTransform: "uppercase" }}>
                        ✨ &nbsp; The heroes
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {result.heroes.map((h, i) => (
                          <div key={i} style={{ background: C.surfaceSolid, padding: "16px 20px", border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.sage}`, backdropFilter: "blur(8px)" }}>
                            <div style={{ fontFamily: "\'Libre Caslon Display\', serif", fontSize: 18, color: C.cream, marginBottom: 4 }}>
                              {h.ingredient}
                            </div>
                            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>{h.why}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* HIT 5: SKIN GOALS */}
            {result.skinGoals && (
              <div className="reveal r6" style={{ marginBottom: 60 }}>
                <div className="section-label">Skin Goals · How Well It Delivers</div>
                <div style={{ background: C.surfaceSolid, padding: "28px 26px", border: `1px solid ${C.line}`, backdropFilter: "blur(8px)" }}>
                  {[
                    ["Hydration", result.skinGoals.hydration],
                    ["Brightening", result.skinGoals.brightening],
                    ["Anti-Acne", result.skinGoals.antiAcne],
                    ["Anti-Ageing", result.skinGoals.antiAgeing],
                    ["Sensitive Skin Safe", result.skinGoals.sensitiveSkinSafe],
                  ].map(([label, value], i) => {
                    const v = Math.max(0, Math.min(10, Number(value) || 0));
                    const color = v >= 7 ? C.sage : v >= 4 ? C.tan : C.brick;
                    const word = v >= 8 ? "Strong" : v >= 6 ? "Decent" : v >= 4 ? "Weak" : v >= 2 ? "Barely" : "No";
                    return (
                      <div key={i} style={{ marginBottom: i === 4 ? 0 : 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: C.cream, fontWeight: 500 }}>{label}</span>
                          <span style={{
                            fontSize: 10, letterSpacing: 2, color, fontWeight: 700, textTransform: "uppercase",
                          }}>{word}</span>
                        </div>
                        <div className="meter-track">
                          <div className="meter-fill" style={{ width: `${v * 10}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* HIT 6: WORKS FOR / SKIP IF */}
            {(result.worksFor?.length > 0 || result.skipIf?.length > 0) && (
              <div className="reveal r6" style={{ marginBottom: 60 }}>
                <div className="section-label">Should You?</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ background: C.surfaceSolid, padding: "20px 22px", border: `1px solid ${C.line}`, borderTop: `3px solid ${C.sage}`, backdropFilter: "blur(8px)" }}>
                    <div style={{ fontSize: 10, letterSpacing: 3, color: C.sage, fontWeight: 800, marginBottom: 12, textTransform: "uppercase" }}>
                      Works For
                    </div>
                    {result.worksFor?.map((w, i) => (
                      <div key={i} style={{ fontSize: 13, color: C.cream, lineHeight: 1.6, marginBottom: 8 }}>
                        · {w}
                      </div>
                    ))}
                  </div>
                  <div style={{ background: C.surfaceSolid, padding: "20px 22px", border: `1px solid ${C.line}`, borderTop: `3px solid ${C.brick}`, backdropFilter: "blur(8px)" }}>
                    <div style={{ fontSize: 10, letterSpacing: 3, color: C.brick, fontWeight: 800, marginBottom: 12, textTransform: "uppercase" }}>
                      Skip If
                    </div>
                    {result.skipIf?.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, color: C.cream, lineHeight: 1.6, marginBottom: 8 }}>
                        · {s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* EXTRACTED INGREDIENTS */}
            {result.extractedIngredients && (
              <div style={{ marginBottom: 40, background: C.surface, padding: "14px 18px", border: `1px solid ${C.line}` }}>
                <div className="micro" style={{ fontSize: 9, marginBottom: 6 }}>Read from your photo</div>
                <div style={{ fontSize: 11, color: C.ink, lineHeight: 1.7 }}>{result.extractedIngredients}</div>
              </div>
            )}

            {/* CTAs */}
            <div style={{ marginTop: 40, borderTop: `1px solid ${C.line}`, paddingTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="btn" onClick={reset}>Scan Another</button>
              <button className="ghost" onClick={() => {
                const txt = `My ${flag.label} verdict from SERAI/SCANNER: ${result.productGuess || "this product"} — ${result.score}/10. "${result.punchline}" Try it: ${window.location.origin}`;
                if (navigator.share) {
                  navigator.share({ text: txt }).catch(()=>{});
                } else {
                  navigator.clipboard?.writeText(txt);
                  alert("Verdict copied to clipboard");
                }
              }}>Share This Verdict</button>
              <div style={{ textAlign: "center", marginTop: 16, fontFamily: "\'Libre Caslon Display\', serif", fontSize: 13, color: C.faint, fontStyle: "italic" }}>
                Reads the back of the bottle so you don\'t have to.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
