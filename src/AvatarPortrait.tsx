import { AVATARS } from "../shared/spaces";
export function AvatarPortrait({
  avatar = "man",
  color = "#c87855",
}: {
  avatar?: string;
  color?: string;
}) {
  const a = AVATARS.find((p) => p.id === avatar) || AVATARS[0],
    covered = ["woman", "niqab", "girl"].includes(a.id),
    small = ["child", "girl"].includes(a.id);
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={a.label + " avatar"}
      className="avatar-portrait"
      data-faceless="true"
      data-avatar={a.id}
    >
      <circle cx="50" cy="50" r="48" fill="#edf0e5" />
      <g transform={small ? "translate(10 14) scale(.8)" : ""}>
        <path d="M15 100V86Q15 62 50 62Q85 62 85 86V100" fill={color} />
        <path d="M43 56h14v15q-7 7-14 0" fill={a.skin} />
        {covered ? (
          <>
            <path
              d="M19 78L25 29Q28 9 50 9Q74 9 77 32L83 78Q50 90 19 78"
              fill={color}
            />
            <ellipse cx="50" cy="40" rx="17" ry="24" fill={a.skin} />
            {a.id === "niqab" && <path d="M31 40h38v25H31Z" fill={color} />}
          </>
        ) : (
          <>
            <ellipse cx="50" cy="40" rx="21" ry="26" fill={a.skin} />
            <path
              d="M29 40V26Q32 10 50 12Q73 12 72 35L66 29Q50 32 40 25L34 40"
              fill={a.hair}
            />
            {["adult", "elder"].includes(a.id) && (
              <path
                data-beard={a.id === "elder" ? "white" : "black"}
                d="M30 46q2 26 20 28q18-2 20-28q-8 13-20 8q-12 5-20-8"
                fill={a.id === "elder" ? "#eeeEE8" : "#20221f"}
              />
            )}
          </>
        )}
      </g>
    </svg>
  );
}
