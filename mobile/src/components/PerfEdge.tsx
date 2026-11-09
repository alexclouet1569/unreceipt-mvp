// The perforated top edge of a receipt (DESIGN.md signature element), the
// same as the website's PerfEdge: an 8pt strip of the card with round 8×8
// holes in the page colour every 16pt.

import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const HEIGHT = 8;
const PITCH = 16;

export function PerfEdge({ color, background }: { color: string; background: string }) {
  const [width, setWidth] = useState(0);
  const holes = Math.ceil(width / PITCH);
  return (
    <View
      style={{ height: HEIGHT, backgroundColor: color }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {Array.from({ length: holes }, (_, i) => (
            <Circle key={i} cx={PITCH / 2 + i * PITCH} cy={HEIGHT / 2} r={HEIGHT / 2} fill={background} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
