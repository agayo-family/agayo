"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { preload } from "react-dom";
import { usePathname } from "next/navigation";

const INTRO_MS = 2600;

function IntroArtwork({ portrait = false }: { portrait?: boolean }) {
  const width = portrait ? 600 : 1000;
  const height = portrait ? 1000 : 600;
  const cx = width / 2;
  const cy = height / 2;
  const logoWidth = width * (portrait ? .82 : .64);
  const logoHeight = logoWidth * 373 / 786;
  const id = `agayo-intro-${portrait ? "portrait" : "wide"}`;
  const fill = (name: string) => `url(#${id}-${name})`;
  const path = (points: number[][]) => points.map(([x, y], index) => `${index ? "L" : "M"}${x * width / 1000} ${y * height / 600}`).join(" ");
  return <svg className={`agayo-entry-art ${portrait ? "is-portrait" : "is-wide"}`} viewBox={`0 0 ${width} ${height}`} focusable="false" style={{ "--scene-x": `${cx}px`, "--scene-y": `${cy}px`, "--scene-unit": width / 1000 } as CSSProperties}>
    <defs>
      <linearGradient id={`${id}-red`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#540c23" /><stop offset=".2" stopColor="#a7163e" /><stop offset=".43" stopColor="#eb2754" /><stop offset=".64" stopColor="#ff5267" /><stop offset=".84" stopColor="#ffa47b" /><stop offset="1" stopColor="#aa1c40" /></linearGradient>
      <radialGradient id={`${id}-light`}><stop stopColor="#ff7682" /><stop offset=".5" stopColor="#f32c65" /><stop offset="1" stopColor="#a71c51" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-wine`}><stop stopColor="#721141" /><stop offset=".55" stopColor="#5f0d30" /><stop offset="1" stopColor="#360b1d" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-heat`}><stop stopColor="#ffd2a1" /><stop offset=".32" stopColor="#ff8979" /><stop offset="1" stopColor="#f44d69" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2e071c" stopOpacity=".3" /><stop offset=".3" stopColor="#8a1b43" stopOpacity=".06" /><stop offset=".485" stopColor="#ffc1a9" stopOpacity=".2" /><stop offset=".51" stopColor="#ffe0c0" stopOpacity=".3" /><stop offset=".55" stopColor="#5b0a2b" stopOpacity=".2" /><stop offset=".82" stopColor="#220919" stopOpacity=".24" /><stop offset="1" stopColor="#f95373" stopOpacity=".1" /></linearGradient>
      <linearGradient id={`${id}-shine`}><stop stopColor="#ffdbc3" stopOpacity="0" /><stop offset=".36" stopColor="#ffdbc3" stopOpacity="0" /><stop offset=".5" stopColor="#ffe0c8" stopOpacity=".46" /><stop offset=".64" stopColor="#ffdbc3" stopOpacity="0" /><stop offset="1" stopColor="#ffdbc3" stopOpacity="0" /></linearGradient>
      <pattern id={`${id}-brushed`} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1H6" stroke="#260913" strokeOpacity=".14" /><path d="M0 3H6" stroke="#ffd0bc" strokeOpacity=".075" /></pattern>
      <mask id={`${id}-shape`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: "alpha" }}>
        <ellipse className="agayo-entry-cloud-mask" cx={cx} cy={cy} rx={width * .485} ry={height * .48} fill="white">
          <animate attributeName="rx" values={[width * .485, width * .485, width * .485 * .68, 0, 0].join(";")} keyTimes="0;.23;.43;.61;1" keySplines=".72 0 .22 1;.72 0 .22 1;.72 0 .22 1;0 0 1 1" calcMode="spline" dur="2.6s" begin="0s" fill="freeze" />
          <animate attributeName="ry" values={[height * .48, height * .48, height * .48 * .62, 0, 0].join(";")} keyTimes="0;.23;.43;.61;1" keySplines=".72 0 .22 1;.72 0 .22 1;.72 0 .22 1;0 0 1 1" calcMode="spline" dur="2.6s" begin="0s" fill="freeze" />
        </ellipse>
        <image href="/agayo-logo-mask.png" x={cx - logoWidth / 2} y={cy - logoHeight / 2} width={logoWidth} height={logoHeight} />
      </mask>
    </defs>
    <g className="agayo-entry-chamber" fill="none" stroke="#dc687c" strokeWidth="1">
      <path d={`${path([[35, 128], [114, 46], [886, 46], [965, 128], [965, 472], [886, 554], [114, 554], [35, 472]])}Z`} />
      <path d={`${path([[50, 300], [170, 300]])} ${path([[830, 300], [950, 300]])} ${path([[500, 24], [500, 106]])} ${path([[500, 494], [500, 576]])}`} opacity=".55" />
    </g>
    <g mask={fill("shape")}>
      <rect width={width} height={height} fill={fill("red")} />
      <ellipse className="agayo-entry-color-wave" cx={width * .65} cy={height * .47} rx={width * .5} ry={height * .58} fill={fill("light")} />
      <ellipse className="agayo-entry-undertow" cx={width * .34} cy={cy} rx={width * .43} ry={height * .53} fill={fill("wine")} />
      <ellipse className="agayo-entry-heat-wave" cx={width * .66} cy={height * .34} rx={width * .31} ry={height * .4} fill={fill("heat")} />
      <rect width={width} height={height} fill={fill("metal")} />
      <rect width={width} height={height} fill={fill("brushed")} />
      <g className="agayo-entry-specular"><rect x={width * -.55} y={height * -.42} width={width * .65} height={height * 1.84} fill={fill("shine")} /></g>
    </g>
  </svg>;
}

export default function EntryReveal() {
  const pathname = usePathname();
  const [finished, setFinished] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const privateFlow = /^\/(?:admin(?:-preview)?|auth|profile|tickets)(?:\/|$)/.test(pathname) || /\/checkout(?:\/|$)/.test(pathname);

  useEffect(() => {
    if (finished || privateFlow) return;
    const element = overlay.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || getComputedStyle(element).visibility === "hidden") {
      setFinished(true); return;
    }
    const main = document.querySelector<HTMLElement>("#main-content");
    const previousInert = main?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = "hidden";
    // CSS starts at first paint. Hydration never adds another 2.6 seconds.
    const elapsed = Number(element.getAnimations()[0]?.currentTime ?? 0);
    const timer = window.setTimeout(() => setFinished(true), Math.max(0, INTRO_MS - elapsed) + 100);
    return () => {
      window.clearTimeout(timer);
      if (main) main.inert = previousInert;
      document.body.style.overflow = previousOverflow;
    };
  }, [finished, privateFlow]);

  if (finished || privateFlow) return null;
  preload("/agayo-logo-mask.png", { as: "image" });
  return <div ref={overlay} className="agayo-entry-reveal" data-intro-style="industrial" role="region" aria-label="Вступление AGAYO" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setFinished(true); }}>
    <div className="agayo-entry-grid" aria-hidden="true" />
    <div className="agayo-entry-halo" aria-hidden="true" />
    <div className="agayo-entry-chassis" aria-hidden="true"><i /><i /><i /><i /><span /><span /></div>
    <div className="agayo-entry-wavefront" aria-hidden="true" />
    <div className="agayo-entry-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--ray": index } as CSSProperties} />)}</div>
    <div className="agayo-entry-sparks" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--spark": index } as CSSProperties} />)}</div>
    <div className="agayo-entry-art-frame" aria-hidden="true"><IntroArtwork /><IntroArtwork portrait /><div className="agayo-entry-glints"><i /><i /></div></div>
    <div className="agayo-entry-caption" aria-hidden="true"><span>AGAYO FAMILY</span><span>ПРОЖИВИ ЭТОТ ВЕЧЕР</span></div>
    <button className="agayo-entry-skip" type="button" onClick={() => setFinished(true)}>Пропустить <span aria-hidden="true">↗</span></button>
  </div>;
}
