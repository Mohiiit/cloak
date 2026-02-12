import React from "react";

interface Props {
  size?: number;
  color?: string;
  className?: string;
}

export function CloakIcon({ size = 24, color, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {color ? (
        <>
          <path
            d="M256 52C220 52 186 72 164 104L96 208C80 232 72 260 72 290L72 360C72 380 80 398 96 410L144 448C152 454 162 456 172 454L196 444C204 442 210 436 214 428L232 384C240 368 256 360 256 360C256 360 272 368 280 384L298 428C302 436 308 442 316 444L340 454C350 456 360 454 368 448L416 410C432 398 440 380 440 360L440 290C440 260 432 232 416 208L348 104C326 72 292 52 256 52Z"
            fill={color}
          />
          <path
            d="M256 180L296 256L256 340L216 256Z"
            fill="#0F172A"
            opacity={0.85}
          />
        </>
      ) : (
        <>
          <defs>
            <linearGradient id="cg" x1="128" y1="48" x2="384" y2="464" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="50%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient id="ig" x1="256" y1="160" x2="256" y2="380" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <path
            d="M256 52C220 52 186 72 164 104L96 208C80 232 72 260 72 290L72 360C72 380 80 398 96 410L144 448C152 454 162 456 172 454L196 444C204 442 210 436 214 428L232 384C240 368 256 360 256 360C256 360 272 368 280 384L298 428C302 436 308 442 316 444L340 454C350 456 360 454 368 448L416 410C432 398 440 380 440 360L440 290C440 260 432 232 416 208L348 104C326 72 292 52 256 52Z"
            fill="url(#cg)"
          />
          <path
            d="M256 180L296 256L256 340L216 256Z"
            fill="#0F172A"
            opacity={0.85}
          />
          <path
            d="M256 200L286 256L256 318L226 256Z"
            fill="url(#ig)"
            opacity={0.25}
          />
        </>
      )}
    </svg>
  );
}
