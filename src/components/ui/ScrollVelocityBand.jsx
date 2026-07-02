import React from "react";
import { splitCoupleNames, useEventContent } from '@/state/eventContent.js';
import ScrollVelocity from '@/components/ui/ScrollVelocity.jsx';

/**
 * Wedding-branded scroll marquee — sits under the hero on Tonight.
 */
export default function ScrollVelocityBand() {
  const content = useEventContent();
  const [first, second] = splitCoupleNames(content);
  return (
    <ScrollVelocity
      text={[first, second].filter(Boolean).join(" & ") + "  ·  " + content.dateDisplay}
      velocity={38}
      damping={72}
      stiffness={260}
      numCopies={8}
      velocityMapping={{ input: [0, 700], output: [0, 2.6] }}
    />
  );
}
