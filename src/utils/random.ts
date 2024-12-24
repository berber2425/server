import { randomBytes } from "crypto";

export function randomColor() {
  const colors: number[] = [];

  for (let i = 0; i < 3; i += 1) {
    if (i === 0) {
      colors.push(Math.floor(Math.random() * 360));
    } else {
      colors.push((colors[i - 1] + 80 + Math.floor(Math.random() * 100)) % 360);
    }
  }

  return colors.join(",");
}

export function randomString(length: number): string {
  return randomBytes(length).toString("hex");
}
