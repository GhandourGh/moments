import React from "react";
import { COUPLE, COUPLE_NAMES } from "../couple.js";
import ScrollVelocity from "./ScrollVelocity.jsx";

const [first, second] = COUPLE_NAMES;

/**
 * Wedding-branded scroll marquee — sits under the hero on Tonight.
 */
export default function ScrollVelocityBand() {
  return (
    <ScrollVelocity
      text={`${first} & ${second}  ·  ${COUPLE.date}`}
      velocity={38}
      damping={72}
      stiffness={260}
      numCopies={8}
      velocityMapping={{ input: [0, 700], output: [0, 2.6] }}
    />
  );
}
