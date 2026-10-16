import { AVATARS } from "../shared/spaces";
export function AvatarPortrait({
  avatar = "man",
  color = "#c87855",
}: {
  avatar?: string;
  color?: string;
}) {
  const a = AVATARS.find((p) => p.id === avatar) || AVATARS[0];
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={a.label + " avatar"}
      className="avatar-portrait"
    >
      <circle cx="50" cy="50" r="48" fill="#edf0e5" />
      <path d="M15 100V86Q15 62 50 62Q85 62 85 86V100" fill={color} />
      <path d="M43 56h14v15q-7 7-14 0" fill={a.skin} />
      <ellipse cx="50" cy="40" rx="21" ry="26" fill={a.skin} />
      <path
        d="M29 40V26Q32 10 50 12Q73 12 72 35L66 29Q50 32 40 25L34 40"
        fill={a.hair}
      />
      {a.id === "woman" && (
        <path d="M29 31q-8 35 4 38l4-29M71 31q8 35-4 38l-4-29" fill={a.hair} />
      )}
      <g fill="#302c28">
        <circle cx="42" cy="42" r="2" />
        <circle cx="58" cy="42" r="2" />
      </g>
      <path
        d="M44 55q6 4 12 0"
        fill="none"
        stroke="#9a6553"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {a.id === "elder" && (
        <g fill="none" stroke="#696d68" strokeWidth="1.5">
          <circle cx="41" cy="42" r="7" />
          <circle cx="59" cy="42" r="7" />
          <path d="M48 42h4" />
        </g>
      )}
      {a.id === "adult" && (
        <path d="M32 48q3 21 18 20q15 0 18-20l-9 10H41Z" fill={a.hair} />
      )}
    </svg>
  );
}
