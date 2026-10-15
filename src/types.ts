export type Person = {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  mic: boolean;
  camera: boolean;
  meeting: boolean;
  host: boolean;
};
export type Message = { id: string; name: string; text: string; at: number };
export const COLORS = [
  "#c87855",
  "#628c7a",
  "#798ab6",
  "#bd8bba",
  "#d6ac5b",
  "#6aabb2",
];
export const PLACES = [
  {
    name: "Village square",
    label: "The heart of Hallstatt",
    x: 3.5,
    z: 9,
    icon: "square",
  },
  {
    name: "Lakeside lounge",
    label: "A moment by the water",
    x: 21,
    z: 8,
    icon: "lake",
  },
  {
    name: "Alpine garden",
    label: "A little room to think",
    x: -15,
    z: 14,
    icon: "tree",
  },
  {
    name: "The meeting house",
    label: "Good ideas gather here",
    x: -13,
    z: -10,
    icon: "house",
  },
];
